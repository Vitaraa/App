import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import { categorize, merchantToken, normalizeDescription } from "./categorize.js";

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
    .prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC")
    .all(req.user.id);
  res.json(rows);
});

app.post("/api/transactions", auth, (req, res) => {
  const { type, amount, category, note, date } = req.body || {};
  if (!["income", "expense"].includes(type))
    return res.status(400).json({ error: "type must be 'income' or 'expense'" });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0)
    return res.status(400).json({ error: "amount must be a positive number" });

  const info = db
    .prepare(
      `INSERT INTO transactions (user_id, type, amount, category, note, date, description, needs_review, source)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), '', 0, 'manual')`
    )
    .run(req.user.id, type, amt, category || "Other", note || "", date || null);
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

  // Learn a rule from the correction (only for real categories on rows that
  // came from a statement and have a merchant description).
  if (categoryChanged && existing.description && next.category !== "Uncategorized") {
    const pattern = merchantToken(existing.description);
    if (pattern) {
      db.prepare(
        `INSERT INTO category_rules (user_id, pattern, category, hits, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'))
         ON CONFLICT(user_id, pattern)
         DO UPDATE SET category = excluded.category,
                       hits = category_rules.hits + 1,
                       updated_at = datetime('now')`
      ).run(req.user.id, pattern, next.category);
    }
  }

  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(existing.id);
  res.json(row);
});

// Bulk import parsed statement rows. The client parses the CSV/PDF into
// candidate rows; the server categorizes each (built-in + learned rules) and
// inserts them, flagging uncertain ones for review.
app.post("/api/transactions/import", auth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: "items array required" });

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
    `INSERT INTO transactions (user_id, type, amount, category, note, date, description, needs_review, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import')`
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
        req.user.id, type, amt, category, "", date, description, needsReview
      );
      rows.push(db.prepare("SELECT * FROM transactions WHERE id = ?").get(info.lastInsertRowid));
      imported++;
    }
  });
  run();

  res.status(201).json({ imported, flagged, skipped, rows });
});

app.delete("/api/transactions/:id", auth, (req, res) => {
  const info = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---- Accounts (for net worth) -------------------------------------------
// Map a fine-grained account type to its net-worth sign. Assets count
// positively, liabilities negatively. Keep in sync with client institutions.js.
const TYPE_KIND = {
  chequing: "asset", savings: "asset", investment: "asset", cash: "asset", other_asset: "asset",
  credit_card: "liability", mortgage: "liability", auto_loan: "liability",
  line_of_credit: "liability", student_loan: "liability", loan: "liability", other_liability: "liability",
};
function kindForType(type, fallback) {
  return TYPE_KIND[type] || fallback || "asset";
}

app.get("/api/accounts", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id").all(req.user.id)
  );
});

app.post("/api/accounts", auth, (req, res) => {
  const { name, kind, balance, type, institution } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: "name is required" });
  const t = type && TYPE_KIND[type] ? type : kind === "liability" ? "other_liability" : "other_asset";
  const k = kindForType(t, kind === "liability" ? "liability" : "asset");
  const info = db
    .prepare(
      "INSERT INTO accounts (user_id, name, kind, balance, type, institution) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(req.user.id, String(name).trim(), k, Number(balance) || 0, t, String(institution || "other"));
  res.status(201).json(db.prepare("SELECT * FROM accounts WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/accounts/:id", auth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { name, kind, balance, type, institution } = req.body || {};
  const nextType = type && TYPE_KIND[type] ? type : row.type;
  // kind follows the type; an explicit kind only applies when no type is known.
  const nextKind = type
    ? kindForType(nextType)
    : kind === "asset" || kind === "liability"
    ? kind
    : row.kind;
  db.prepare(
    "UPDATE accounts SET name = ?, kind = ?, balance = ?, type = ?, institution = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(
    name != null ? String(name).trim() : row.name,
    nextKind,
    balance != null ? Number(balance) || 0 : row.balance,
    nextType,
    institution != null ? String(institution) : row.institution,
    row.id,
    req.user.id
  );
  res.json(db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.id));
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
