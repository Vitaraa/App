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
`);

export default db;
