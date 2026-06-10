import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import { categorize, merchantKey, normalizeDescription } from "./categorize.js";
import { getQuotes, searchSymbols, getHistory } from "./quotes.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const TOKEN_TTL = "30d";

const app = express();
app.use(cors());
app.use(express.json());

// ---- Auth helpers -------------------------------------------------------
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---- Auth routes --------------------------------------------------------
app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "Username already taken" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password) VALUES (?, ?)")
    .run(username, hash);
  const user = { id: info.lastInsertRowid, username };
  res.status(201).json({ token: signToken(user), username });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Username and password are required" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Invalid username or password" });

  res.json({ token: signToken(user), username: user.username });
});

// ---- Transaction routes -------------------------------------------------
app.get("/api/transactions", auth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, a.name AS account_name
         FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

// Validate that an account id (if given) belongs to the user; returns id or null.
function ownedAccountId(userId, accountId) {
  if (accountId == null) return null;
  const a = db.prepare("SELECT id FROM accounts WHERE id = ? AND user_id = ?").get(accountId, userId);
  return a ? a.id : null;
}

app.post("/api/transactions", auth, (req, res) => {
  const { type, amount, category, note, date, account_id } = req.body || {};
  if (!["income", "expense"].includes(type))
    return res.status(400).json({ error: "type must be 'income' or 'expense'" });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0)
    return res.status(400).json({ error: "amount must be a positive number" });

  const acctId = ownedAccountId(req.user.id, account_id);
  const info = db
    .prepare(
      `INSERT INTO transactions (user_id, type, amount, category, note, date, description, needs_review, source, account_id)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), '', 0, 'manual', ?)`
    )
    .run(req.user.id, type, amt, category || "Other", note || "", date || null, acctId);
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Edit a transaction (category, note, type, amount, date). Editing the category
// of an imported row teaches a learned rule so future imports auto-label it.
app.patch("/api/transactions/:id", auth, (req, res) => {
  const existing = db
    .prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { category, note, type, amount, date } = req.body || {};
  const next = {
    category: category != null ? String(category) : existing.category,
    note: note != null ? String(note) : existing.note,
    type: ["income", "expense"].includes(type) ? type : existing.type,
    amount: existing.amount,
    date: date != null ? String(date) : existing.date,
  };
  if (amount != null) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return res.status(400).json({ error: "amount must be a positive number" });
    next.amount = amt;
  }

  // A manual category edit resolves the review flag.
  const categoryChanged = category != null && category !== existing.category;
  const needsReview = categoryChanged ? 0 : existing.needs_review;

  db.prepare(
    `UPDATE transactions
        SET category = ?, note = ?, type = ?, amount = ?, date = ?, needs_review = ?
      WHERE id = ? AND user_id = ?`
  ).run(next.category, next.note, next.type, next.amount, next.date, needsReview, existing.id, req.user.id);

  // Learn a rule from the correction AND re-label every existing transaction
  // from the same merchant — so categorizing "ALIEXPRESS -> Shopping" once
  // fixes them all and is remembered for future imports.
  let alsoUpdated = 0;
  if (categoryChanged && existing.description && next.category !== "Uncategorized") {
    const pattern = merchantKey(existing.description);
    if (pattern) {
      db.prepare(
        `INSERT INTO category_rules (user_id, pattern, category, hits, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'))
         ON CONFLICT(user_id, pattern)
         DO UPDATE SET category = excluded.category,
                       hits = category_rules.hits + 1,
                       updated_at = datetime('now')`
      ).run(req.user.id, pattern, next.category);

      // Find every other transaction from the same merchant and update it.
      const candidates = db
        .prepare("SELECT id, description, category FROM transactions WHERE user_id = ? AND description <> ''")
        .all(req.user.id);
      const upd = db.prepare(
        "UPDATE transactions SET category = ?, needs_review = 0 WHERE id = ? AND user_id = ?"
      );
      const run = db.transaction(() => {
        for (const c of candidates) {
          if (c.id === existing.id) continue;
          if (c.category === next.category) continue;
          if (merchantKey(c.description) === pattern) {
            upd.run(next.category, c.id, req.user.id);
            alsoUpdated++;
          }
        }
      });
      run();
    }
  }

  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(existing.id);
  res.json({ ...row, alsoUpdated });
});

// Bulk import parsed statement rows. The client parses the CSV/PDF into
// candidate rows; the server categorizes each (built-in + learned rules) and
// inserts them, flagging uncertain ones for review.
app.post("/api/transactions/import", auth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: "items array required" });

  // Link this import to an account by the statement's last 4 digits.
  const last4 = clean4(req.body?.last4);
  let linkedAccount = null;
  if (last4) {
    linkedAccount = db
      .prepare("SELECT id, name FROM accounts WHERE user_id = ? AND last4 = ?")
      .get(req.user.id, last4);
  }
  const accountId = linkedAccount ? linkedAccount.id : null;

  const learned = db
    .prepare("SELECT pattern, category FROM category_rules WHERE user_id = ?")
    .all(req.user.id);

  // Build a lookup of existing rows to skip duplicates (same date+amount+desc).
  const existingRows = db
    .prepare("SELECT date, amount, type, description FROM transactions WHERE user_id = ?")
    .all(req.user.id);
  const seen = new Set(
    existingRows.map(
      (r) => `${r.date}|${r.amount}|${r.type}|${normalizeDescription(r.description)}`
    )
  );

  const insert = db.prepare(
    `INSERT INTO transactions (user_id, type, amount, category, note, date, description, needs_review, source, account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)`
  );

  let imported = 0;
  let flagged = 0;
  let skipped = 0;
  const rows = [];

  const run = db.transaction(() => {
    for (const it of items) {
      const amt = Math.abs(Number(it.amount));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const type = it.type === "income" ? "income" : "expense";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(it.date || "")
        ? it.date
        : new Date().toISOString().slice(0, 10);
      const description = String(it.description || "").slice(0, 300);

      const key = `${date}|${amt}|${type}|${normalizeDescription(description)}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      const { category, confident } = categorize(description, learned, type);
      const needsReview = confident ? 0 : 1;
      if (needsReview) flagged++;

      const info = insert.run(
        req.user.id, type, amt, category, "", date, description, needsReview, accountId
      );
      rows.push(db.prepare("SELECT * FROM transactions WHERE id = ?").get(info.lastInsertRowid));
      imported++;
    }
  });
  run();

  res.status(201).json({
    imported, flagged, skipped, rows, last4,
    linkedAccount: linkedAccount ? linkedAccount.name : null,
  });
});

app.delete("/api/transactions/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Accounts (for net worth) -------------------------------------------
// Accounts are organized into display groups; the group also sets the
// net-worth sign. Keep in sync with client institutions.js.
const GROUP_KIND = {
  cash: "asset",
  investments: "asset",
  credit_cards: "liability",
  loans: "liability",
};
const VALID_GROUPS = new Set(Object.keys(GROUP_KIND));
// type -> default group (covers legacy other_asset / other_liability rows).
const TYPE_GROUP = {
  chequing: "cash", savings: "cash", cash: "cash", other_asset: "cash",
  investment: "investments",
  credit_card: "credit_cards",
  mortgage: "loans", auto_loan: "loans", line_of_credit: "loans",
  student_loan: "loans", loan: "loans", other_liability: "loans",
};
const groupForType = (type) => TYPE_GROUP[type] || "cash";
// A chosen group (for "other" types) wins; otherwise derive from the type.
const resolveGroup = (type, group) => (VALID_GROUPS.has(group) ? group : groupForType(type));

// How a transaction moves an account's balance. Assets: income adds, expense
// subtracts. Liabilities (cards/loans, balance = amount owed): a charge
// (expense) adds to what's owed, a payment (income) reduces it.
function signedDelta(kind, type, amount) {
  const amt = Number(amount) || 0;
  if (kind === "liability") return type === "expense" ? amt : -amt;
  return type === "income" ? amt : -amt;
}

// Compute market value + cost basis for a set of holdings using live quotes.
function valueHoldings(holdings, quotes) {
  let value = 0;
  let cost = 0;
  for (const h of holdings) {
    const price = quotes[String(h.ticker).toUpperCase()];
    const unit = price != null ? price : h.purchase_price; // fall back to cost if no quote
    value += unit * h.quantity;
    cost += h.purchase_price * h.quantity;
  }
  return { value: round2(value), cost: round2(cost) };
}

// Each account gets a `value` (what net worth uses): the balance for normal
// accounts, or live market value for investment accounts.
app.get("/api/accounts", auth, async (req, res) => {
  const accts = db
    .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id")
    .all(req.user.id);

  const invIds = accts.filter((a) => a.type === "investment").map((a) => a.id);
  const byAccount = {};
  let quotes = {};
  if (invIds.length) {
    const holds = db
      .prepare(
        `SELECT * FROM holdings WHERE user_id = ? AND account_id IN (${invIds.map(() => "?").join(",")})`
      )
      .all(req.user.id, ...invIds);
    for (const h of holds) (byAccount[h.account_id] ||= []).push(h);
    try {
      quotes = await getQuotes([...new Set(holds.map((h) => h.ticker))]);
    } catch {
      quotes = {};
    }
  }

  // Net of linked transactions per non-investment account.
  const kindByAccount = {};
  for (const a of accts) {
    kindByAccount[a.id] = GROUP_KIND[a.account_group || groupForType(a.type)] || a.kind;
  }
  const linked = db
    .prepare("SELECT account_id, type, amount FROM transactions WHERE user_id = ? AND account_id IS NOT NULL")
    .all(req.user.id);
  const deltaByAccount = {};
  for (const t of linked) {
    const k = kindByAccount[t.account_id];
    if (!k) continue;
    deltaByAccount[t.account_id] = (deltaByAccount[t.account_id] || 0) + signedDelta(k, t.type, t.amount);
  }

  const out = accts.map((a) => {
    const group = a.account_group || groupForType(a.type);
    const kind = GROUP_KIND[group] || a.kind;
    if (a.type === "investment") {
      const { value, cost } = valueHoldings(byAccount[a.id] || [], quotes);
      return {
        ...a, account_group: group, kind, value, cost,
        growth: round2(value - cost), holdingsCount: (byAccount[a.id] || []).length,
      };
    }
    // value = starting balance + net of linked transactions
    return {
      ...a, account_group: group, kind,
      value: round2(Number(a.balance) + (deltaByAccount[a.id] || 0)),
    };
  });
  res.json(out);
});

// ---- Holdings (stocks inside an investment account) ---------------------
// Price a list of holding rows with live quotes -> adds price/marketValue/etc.
function priceHoldings(holds, quotes) {
  return holds.map((h) => {
    const price = quotes[String(h.ticker).toUpperCase()] ?? null;
    const marketValue = round2((price ?? h.purchase_price) * h.quantity);
    const costBasis = round2(h.purchase_price * h.quantity);
    return {
      ...h,
      price,
      marketValue,
      costBasis,
      gain: round2(marketValue - costBasis),
      gainPct: costBasis > 0 ? round2(((marketValue - costBasis) / costBasis) * 100) : 0,
    };
  });
}

// All of the user's holdings across every investment account (for the
// dashboard investments widget).
app.get("/api/holdings", auth, async (req, res) => {
  const holds = db
    .prepare(
      `SELECT h.*, a.name AS account_name
         FROM holdings h JOIN accounts a ON a.id = h.account_id
        WHERE h.user_id = ? ORDER BY h.id`
    )
    .all(req.user.id);
  let quotes = {};
  try {
    quotes = await getQuotes(holds.map((h) => h.ticker));
  } catch {
    quotes = {};
  }
  res.json(priceHoldings(holds, quotes));
});

app.get("/api/accounts/:id/holdings", auth, async (req, res) => {
  const acct = db
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error: "Not found" });

  const holds = db
    .prepare("SELECT * FROM holdings WHERE account_id = ? AND user_id = ? ORDER BY id")
    .all(req.params.id, req.user.id);
  let quotes = {};
  try {
    quotes = await getQuotes(holds.map((h) => h.ticker));
  } catch {
    quotes = {};
  }
  res.json(
    holds.map((h) => {
      const price = quotes[String(h.ticker).toUpperCase()] ?? null;
      const marketValue = round2((price ?? h.purchase_price) * h.quantity);
      const costBasis = round2(h.purchase_price * h.quantity);
      return {
        ...h,
        price,
        marketValue,
        costBasis,
        gain: round2(marketValue - costBasis),
        gainPct: costBasis > 0 ? round2(((marketValue - costBasis) / costBasis) * 100) : 0,
      };
    })
  );
});

app.post("/api/accounts/:id/holdings", auth, (req, res) => {
  const acct = db
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error: "Not found" });

  const { ticker, quantity, purchase_price, purchase_date } = req.body || {};
  if (!ticker || !String(ticker).trim())
    return res.status(400).json({ error: "ticker is required" });
  const info = db
    .prepare(
      `INSERT INTO holdings (user_id, account_id, ticker, quantity, purchase_price, purchase_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      acct.id,
      String(ticker).trim().toUpperCase(),
      Number(quantity) || 0,
      Number(purchase_price) || 0,
      purchase_date || null
    );
  res.status(201).json(db.prepare("SELECT * FROM holdings WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/holdings/:id", auth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM holdings WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { ticker, quantity, purchase_price, purchase_date } = req.body || {};
  db.prepare(
    `UPDATE holdings SET ticker = ?, quantity = ?, purchase_price = ?, purchase_date = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    ticker != null ? String(ticker).trim().toUpperCase() : row.ticker,
    quantity != null ? Number(quantity) || 0 : row.quantity,
    purchase_price != null ? Number(purchase_price) || 0 : row.purchase_price,
    purchase_date != null ? purchase_date : row.purchase_date,
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM holdings WHERE id = ?").get(row.id));
});

app.delete("/api/holdings/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM holdings WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Portfolio value/cost over time (monthly samples) for the investments line
// chart. Uses historical daily closes; falls back to cost basis for any ticker
// whose history can't be fetched, so the line always renders.
function monthStarts(startStr) {
  const out = [];
  const d = new Date(startStr + "T00:00:00Z");
  d.setUTCDate(1);
  const now = new Date();
  while (d <= now) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

app.get("/api/investments/history", auth, async (req, res) => {
  const holds = db
    .prepare("SELECT * FROM holdings WHERE user_id = ? ORDER BY purchase_date")
    .all(req.user.id);
  if (!holds.length) return res.json([]);

  const dated = holds.map((h) => h.purchase_date).filter(Boolean).sort();
  const startStr = dated[0] || new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const startSec = Math.floor(new Date(startStr + "T00:00:00Z").getTime() / 1000);

  const tickers = [...new Set(holds.map((h) => h.ticker))];
  const histByTicker = {};
  await Promise.all(
    tickers.map(async (t) => {
      histByTicker[t.toUpperCase()] = await getHistory(t, startSec);
    })
  );
  let quotes = {};
  try {
    quotes = await getQuotes(tickers);
  } catch {
    quotes = {};
  }

  // close on or before a date for a ticker (binary search; null if none)
  function closeAt(ticker, date) {
    const pts = histByTicker[ticker.toUpperCase()] || [];
    let lo = 0;
    let hi = pts.length - 1;
    let ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].date <= date) {
        ans = pts[mid].close;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  const today = new Date().toISOString().slice(0, 10);
  const samples = monthStarts(startStr);
  if (samples[samples.length - 1] !== today) samples.push(today);

  const series = samples.map((date) => {
    let value = 0;
    let cost = 0;
    for (const h of holds) {
      const pd = h.purchase_date || startStr;
      if (pd > date) continue;
      cost += h.purchase_price * h.quantity;
      const live = date === today ? quotes[h.ticker.toUpperCase()] : null;
      const price = live != null ? live : closeAt(h.ticker, date) ?? h.purchase_price;
      value += price * h.quantity;
    }
    return { date, value: round2(value), cost: round2(cost) };
  });

  // S&P 500 benchmark, scaled so it starts equal to the portfolio's value at its
  // first funded sample — so the two lines show relative performance.
  function closeOf(pts, date) {
    let lo = 0;
    let hi = pts.length - 1;
    let ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].date <= date) { ans = pts[mid].close; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }
  let spxHist = [];
  let spxNow = null;
  try {
    spxHist = await getHistory("^GSPC", startSec);
    const q = await getQuotes(["^GSPC"]);
    spxNow = q["^GSPC"] ?? null;
  } catch {
    spxHist = [];
  }
  const baseIdx = series.findIndex((p) => p.value > 0);
  if (spxHist.length && baseIdx >= 0) {
    const baseValue = series[baseIdx].value;
    const baseClose = closeOf(spxHist, series[baseIdx].date);
    if (baseClose) {
      series.forEach((p, i) => {
        if (i < baseIdx) { p.spx = null; return; }
        const c = p.date === today && spxNow != null ? spxNow : closeOf(spxHist, p.date);
        p.spx = c ? round2(baseValue * (c / baseClose)) : null;
      });
    }
  }
  res.json(series);
});

// Ticker autocomplete search.
app.get("/api/symbol-search", auth, async (req, res) => {
  try {
    res.json(await searchSymbols(req.query.q));
  } catch {
    res.json([]);
  }
});

// Raw quotes for a comma-separated symbol list (cached server-side).
app.get("/api/quotes", auth, async (req, res) => {
  const symbols = String(req.query.symbols || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!symbols.length) return res.json({});
  try {
    res.json(await getQuotes(symbols));
  } catch {
    res.json({});
  }
});

const clean4 = (v) => String(v || "").replace(/\D/g, "").slice(-4);

app.post("/api/accounts", auth, (req, res) => {
  const { name, balance, type, institution, group, last4, icon } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: "name is required" });
  const t = type && (TYPE_GROUP[type] || type === "other") ? type : "other";
  const grp = resolveGroup(t, group);
  const k = GROUP_KIND[grp] || "asset";
  const info = db
    .prepare(
      "INSERT INTO accounts (user_id, name, kind, balance, type, institution, account_group, last4, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(req.user.id, String(name).trim(), k, Number(balance) || 0, t, String(institution || "other"), grp, clean4(last4), String(icon || ""));
  res.status(201).json(db.prepare("SELECT * FROM accounts WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/accounts/:id", auth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { name, balance, type, institution, group, last4, icon } = req.body || {};
  const nextType = type && (TYPE_GROUP[type] || type === "other") ? type : row.type;
  const nextGroup = resolveGroup(nextType, group != null ? group : row.account_group);
  const nextKind = GROUP_KIND[nextGroup] || row.kind;
  db.prepare(
    "UPDATE accounts SET name = ?, kind = ?, balance = ?, type = ?, institution = ?, account_group = ?, last4 = ?, icon = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(
    name != null ? String(name).trim() : row.name,
    nextKind,
    balance != null ? Number(balance) || 0 : row.balance,
    nextType,
    institution != null ? String(institution) : row.institution,
    nextGroup,
    last4 != null ? clean4(last4) : row.last4,
    icon != null ? String(icon) : row.icon,
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.id));
});

// Transactions linked to one account (for the account transactions window).
app.get("/api/accounts/:id/transactions", auth, (req, res) => {
  const acct = db
    .prepare("SELECT id FROM accounts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error: "Not found" });
  res.json(
    db
      .prepare(
        "SELECT * FROM transactions WHERE account_id = ? AND user_id = ? ORDER BY date DESC, id DESC"
      )
      .all(req.params.id, req.user.id)
  );
});

app.delete("/api/accounts/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Savings goals ------------------------------------------------------
app.get("/api/goals", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY id").all(req.user.id)
  );
});

app.post("/api/goals", auth, (req, res) => {
  const { name, target, saved } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: "name is required" });
  const info = db
    .prepare("INSERT INTO goals (user_id, name, target, saved) VALUES (?, ?, ?, ?)")
    .run(req.user.id, String(name).trim(), Number(target) || 0, Number(saved) || 0);
  res.status(201).json(db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/goals/:id", auth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { name, target, saved } = req.body || {};
  db.prepare("UPDATE goals SET name = ?, target = ?, saved = ? WHERE id = ? AND user_id = ?").run(
    name != null ? String(name).trim() : row.name,
    target != null ? Number(target) || 0 : row.target,
    saved != null ? Number(saved) || 0 : row.saved,
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM goals WHERE id = ?").get(row.id));
});

app.delete("/api/goals/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM goals WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Subscriptions (manual) ---------------------------------------------
app.get("/api/subscriptions", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id").all(req.user.id)
  );
});

app.post("/api/subscriptions", auth, (req, res) => {
  const { name, amount, cadence } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: "name is required" });
  const cad = cadence === "annual" ? "annual" : "monthly";
  const info = db
    .prepare("INSERT INTO subscriptions (user_id, name, amount, cadence) VALUES (?, ?, ?, ?)")
    .run(req.user.id, String(name).trim(), Number(amount) || 0, cad);
  res.status(201).json(db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/subscriptions/:id", auth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { name, amount, cadence } = req.body || {};
  db.prepare(
    "UPDATE subscriptions SET name = ?, amount = ?, cadence = ? WHERE id = ? AND user_id = ?"
  ).run(
    name != null ? String(name).trim() : row.name,
    amount != null ? Number(amount) || 0 : row.amount,
    cadence === "monthly" || cadence === "annual" ? cadence : row.cadence,
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(row.id));
});

app.delete("/api/subscriptions/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Dismissed auto-detected subscriptions (false positives).
app.get("/api/sub-ignores", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM sub_ignores WHERE user_id = ? ORDER BY id").all(req.user.id)
  );
});

app.post("/api/sub-ignores", auth, (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  db.prepare(
    "INSERT INTO sub_ignores (user_id, name) VALUES (?, ?) ON CONFLICT(user_id, name) DO NOTHING"
  ).run(req.user.id, name);
  const row = db
    .prepare("SELECT * FROM sub_ignores WHERE user_id = ? AND name = ?")
    .get(req.user.id, name);
  res.status(201).json(row);
});

app.delete("/api/sub-ignores/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM sub_ignores WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Plans (long-term goals for Foresight) ------------------------------
app.get("/api/plans", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM plans WHERE user_id = ? ORDER BY id").all(req.user.id));
});

app.post("/api/plans", auth, (req, res) => {
  const { name, kind, target_amount, target_year, return_rate, start_amount, monthly_contribution } =
    req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: "name is required" });
  const info = db
    .prepare(
      `INSERT INTO plans (user_id, name, kind, target_amount, target_year, return_rate, start_amount, monthly_contribution)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      String(name).trim(),
      ["retirement", "house", "custom"].includes(kind) ? kind : "custom",
      Number(target_amount) || 0,
      target_year != null ? Math.round(Number(target_year)) : null,
      Number(return_rate) || 7,
      start_amount != null && start_amount !== "" ? Number(start_amount) : null,
      monthly_contribution != null && monthly_contribution !== "" ? Number(monthly_contribution) : null
    );
  res.status(201).json(db.prepare("SELECT * FROM plans WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/plans/:id", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM plans WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const b = req.body || {};
  const numOrNull = (v, cur) => (v === "" || v === null ? null : v != null ? Number(v) : cur);
  db.prepare(
    `UPDATE plans SET name = ?, kind = ?, target_amount = ?, target_year = ?, return_rate = ?,
       start_amount = ?, monthly_contribution = ? WHERE id = ? AND user_id = ?`
  ).run(
    b.name != null ? String(b.name).trim() : row.name,
    ["retirement", "house", "custom"].includes(b.kind) ? b.kind : row.kind,
    b.target_amount != null ? Number(b.target_amount) || 0 : row.target_amount,
    b.target_year != null ? (b.target_year === "" ? null : Math.round(Number(b.target_year))) : row.target_year,
    b.return_rate != null ? Number(b.return_rate) || 0 : row.return_rate,
    numOrNull(b.start_amount, row.start_amount),
    numOrNull(b.monthly_contribution, row.monthly_contribution),
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM plans WHERE id = ?").get(row.id));
});

app.delete("/api/plans/:id", auth, (req, res) => {
  const info = db.prepare("DELETE FROM plans WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Settings (per-user preferences) ------------------------------------
app.get("/api/settings", auth, (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE user_id = ?").all(req.user.id);
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

app.post("/api/settings", auth, (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key) return res.status(400).json({ error: "key is required" });
  const value = req.body?.value == null ? null : String(req.body.value);
  db.prepare(
    `INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
  ).run(req.user.id, key, value);
  res.json({ ok: true });
});

// ---- Budgets (per-category monthly limits) ------------------------------
app.get("/api/budgets", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM budgets WHERE user_id = ? ORDER BY category").all(req.user.id)
  );
});

// Upsert a category's monthly limit (amount 0 = tracked, no limit). Removal of
// a category from the budget is done via DELETE.
app.post("/api/budgets", auth, (req, res) => {
  const category = String(req.body?.category || "").trim();
  if (!category) return res.status(400).json({ error: "category is required" });
  const existing = db
    .prepare("SELECT * FROM budgets WHERE user_id = ? AND category = ?")
    .get(req.user.id, category);
  // amount and icon are independently optional so a limit edit doesn't wipe the
  // icon and vice versa.
  const amount =
    req.body?.amount != null ? Math.max(0, Number(req.body.amount) || 0) : existing ? existing.amount : 0;
  const icon = req.body?.icon != null ? String(req.body.icon) : existing ? existing.icon : "";
  db.prepare(
    `INSERT INTO budgets (user_id, category, amount, icon) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount, icon = excluded.icon`
  ).run(req.user.id, category, amount, icon);
  res.status(201).json(
    db.prepare("SELECT * FROM budgets WHERE user_id = ? AND category = ?").get(req.user.id, category)
  );
});

// Remove a budget category by name.
app.delete("/api/budgets/by-category/:category", auth, (req, res) => {
  db.prepare("DELETE FROM budgets WHERE user_id = ? AND category = ?").run(
    req.user.id,
    String(req.params.category)
  );
  res.json({ ok: true });
});

app.delete("/api/budgets/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM budgets WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Serve built frontend (production single-server mode) ---------------
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Listen on 0.0.0.0 so other devices on the LAN can reach it.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budget server running on http://0.0.0.0:${PORT}`);
});
