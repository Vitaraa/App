import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "budget.db"));

db.pragma("journal_mode = WAL");

// Users + their transactions. Each transaction belongs to one user.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL,
    type     TEXT NOT NULL CHECK (type IN ('income','expense')),
    amount   REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other',
    note     TEXT DEFAULT '',
    date     TEXT NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);

  -- Learned categorization rules: when a user re-categorizes an imported
  -- transaction, we remember the merchant token -> category mapping so future
  -- imports of the same merchant are auto-labeled with confidence.
  CREATE TABLE IF NOT EXISTS category_rules (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    pattern   TEXT NOT NULL,            -- normalized merchant token
    category  TEXT NOT NULL,
    hits      INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, pattern),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Accounts power the "true net worth" view: assets minus liabilities.
  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'asset' CHECK (kind IN ('asset','liability')),
    balance    REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Manual savings goals.
  CREATE TABLE IF NOT EXISTS goals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    target     REAL NOT NULL DEFAULT 0,
    saved      REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Manually-tracked subscriptions (auto-detected ones come from transactions).
  CREATE TABLE IF NOT EXISTS subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    amount     REAL NOT NULL DEFAULT 0,
    cadence    TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('monthly','annual')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Auto-detected subscriptions the user has dismissed (false positives).
  -- Matched case-insensitively by merchant name when merging.
  CREATE TABLE IF NOT EXISTS sub_ignores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Stock holdings (lots) inside an investment-type account. Market value and
  -- growth are computed from live quotes at request time, not stored.
  CREATE TABLE IF NOT EXISTS holdings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    account_id     INTEGER NOT NULL,
    ticker         TEXT NOT NULL,
    quantity       REAL NOT NULL DEFAULT 0,
    purchase_price REAL NOT NULL DEFAULT 0,
    purchase_date  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_holdings_acct ON holdings(account_id);
`);

// ---- Lightweight migrations for existing databases --------------------------
// Older budget.db files predate the import feature; add new columns if missing.
const txCols = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
function addColumn(sql) {
  try {
    db.exec(sql);
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}
if (!txCols.includes("description")) {
  // Raw merchant text from the statement (manual entries leave this empty).
  addColumn("ALTER TABLE transactions ADD COLUMN description TEXT DEFAULT ''");
}
if (!txCols.includes("needs_review")) {
  // 1 = auto-categorization was uncertain; show a warning flag in the UI.
  addColumn("ALTER TABLE transactions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0");
}
if (!txCols.includes("source")) {
  // 'manual' or 'import'
  addColumn("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
}
if (!txCols.includes("account_id")) {
  // Optional link to the account this transaction belongs to.
  addColumn("ALTER TABLE transactions ADD COLUMN account_id INTEGER");
}

// accounts gained a finer `type` and an `institution` (for the icon badge) in
// the Accounts tab release; older account rows predate them.
const acctCols = db.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
if (!acctCols.includes("type")) {
  addColumn("ALTER TABLE accounts ADD COLUMN type TEXT NOT NULL DEFAULT 'other_asset'");
}
if (!acctCols.includes("institution")) {
  addColumn("ALTER TABLE accounts ADD COLUMN institution TEXT NOT NULL DEFAULT 'other'");
}
if (!acctCols.includes("account_group")) {
  // Display group: cash | investments | credit_cards | loans. ('group' is a SQL
  // keyword, so the column is named account_group.) Empty = derive from type.
  addColumn("ALTER TABLE accounts ADD COLUMN account_group TEXT NOT NULL DEFAULT ''");
}
if (!acctCols.includes("last4")) {
  // Last 4 digits of the card/account number, used to auto-link imported
  // statement transactions to this account.
  addColumn("ALTER TABLE accounts ADD COLUMN last4 TEXT NOT NULL DEFAULT ''");
}

export default db;
