// Browser-side parsing of bank e-statements into candidate transactions.
//
// Output shape per row: { date: "YYYY-MM-DD", description, amount, type }
//   - amount is always a positive number
//   - type is "income" (credit/deposit) or "expense" (debit/withdrawal)
//
// The server then categorizes and de-duplicates these on import.

// ---- Date helpers -----------------------------------------------------------
const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Normalize many common date spellings into YYYY-MM-DD. Returns null if unsure.
export function normalizeDate(raw, fallbackYear) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Already ISO: 2024-03-09 or 2024/03/09
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // US numeric: MM/DD/YYYY or MM-DD-YY or MM/DD
  m = s.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (m) {
    let year = m[3];
    if (!year) year = fallbackYear || new Date().getFullYear();
    else if (year.length === 2) year = "20" + year;
    return `${year}-${pad(m[1])}-${pad(m[2])}`;
  }

  // "9 Mar 2024" / "09 Mar" — numeric day before the month name. Checked first
  // so the year isn't mistaken for the day.
  m = s.match(/^(\d{1,2})\s+([a-z]{3,})\.?\s*(\d{4})?/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] || fallbackYear || new Date().getFullYear();
    return `${year}-${mo}-${pad(m[1])}`;
  }
  // "Mar 9, 2024" / "Mar 09"
  m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const year = m[3] || fallbackYear || new Date().getFullYear();
    return `${year}-${mo}-${pad(m[2])}`;
  }
  return null;
}
const pad = (n) => String(n).padStart(2, "0");

function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /-\s*[\d$]/.test(s) || s.endsWith("-");
  s = s.replace(/[()]/g, "").replace(/[$,\s]/g, "").replace(/-/g, "");
  if (!s || isNaN(Number(s))) return null;
  const n = Number(s);
  return negative ? -n : n;
}

// Statement *summary* fields (minimum payment, balances, credit limit, payment
// due, etc.) carry dollar amounts but are NOT transactions — on a credit-card
// statement the "Minimum Payment Due $10.00" line would otherwise be recorded
// as a $10 charge. Skip any line that mentions one of these.
const SUMMARY_RE =
  /(minimum payment|minimum amount due|payment due|amount due|new balance|previous balance|statement balance|balance forward|credit limit|available credit|available balance|past due|total minimum|opening balance|closing balance|ending balance|beginning balance)/i;
export function isStatementSummaryLine(text) {
  return SUMMARY_RE.test(String(text || ""));
}

// Best-effort detection of the card/account number's last 4 digits, used to
// auto-link an import to an account. Handles masked numbers like
// "4500 XXXX XXXX 2739", "•••• 2739", and "ending in 2739".
export function detectLast4(text) {
  const s = String(text || "");
  // A masked card number: groups of 4 (digits or X/*/•) ending in 4 real digits.
  let m = s.match(/(?:[\dxX*•]{4}[\s-]*){2,}(\d{4})\b/);
  if (m) return m[1];
  m = s.match(/(?:ending(?:\s+in)?|acct\.?|account|card)\s*(?:no\.?|number|#)?[:\s.#xX*•-]{0,8}(\d{4})\b/i);
  if (m) return m[1];
  // A single masked group then 4 digits, e.g. "•••• 5678" or "****5678".
  m = s.match(/[xX*•]{2,}[\s-]*(\d{4})\b/);
  if (m) return m[1];
  return "";
}

// ---- CSV --------------------------------------------------------------------
// Minimal RFC-4180-ish parser that handles quoted fields and embedded commas.
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z]/g, "");

function findCol(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (candidates.some((c) => h === c || h.includes(c))) return i;
  }
  return -1;
}

export function parseCsv(text) {
  const rows = parseCsvText(text);
  if (rows.length < 2) return [];

  // Detect a header row (contains a recognizable date/amount column name).
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const hs = rows[i].map(norm);
    if (hs.some((h) => h.includes("date")) &&
        hs.some((h) => h.includes("amount") || h.includes("debit") || h.includes("credit"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];
  const dateCol = findCol(headers, ["date", "transactiondate", "postingdate", "posteddate"]);
  const descCol = findCol(headers, ["description", "payee", "name", "memo", "details", "transaction", "merchant"]);
  const amtCol = findCol(headers, ["amount", "value"]);
  const debitCol = findCol(headers, ["debit", "withdrawal", "withdrawals", "moneyout"]);
  const creditCol = findCol(headers, ["credit", "deposit", "deposits", "moneyin"]);
  const typeCol = findCol(headers, ["type", "transactiontype", "creditdebit", "drcr"]);

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(dateCol >= 0 ? r[dateCol] : "");
    if (!date) continue;
    const description = (descCol >= 0 ? r[descCol] : "").trim() ||
      r.filter((_, idx) => idx !== dateCol && idx !== amtCol).join(" ").trim();
    if (isStatementSummaryLine(description)) continue;

    let amount = null;
    let type = null;
    if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseAmount(r[debitCol]) : null;
      const credit = creditCol >= 0 ? parseAmount(r[creditCol]) : null;
      if (credit && Math.abs(credit) > 0) { amount = Math.abs(credit); type = "income"; }
      else if (debit && Math.abs(debit) > 0) { amount = Math.abs(debit); type = "expense"; }
    } else if (amtCol >= 0) {
      const a = parseAmount(r[amtCol]);
      if (a != null) {
        amount = Math.abs(a);
        type = a >= 0 ? "income" : "expense";
        if (typeCol >= 0) {
          const t = norm(r[typeCol]);
          if (t.includes("debit") || t.includes("withdrawal") || t === "dr") type = "expense";
          if (t.includes("credit") || t.includes("deposit") || t === "cr") type = "income";
        }
      }
    }
    if (amount == null || amount <= 0) continue;
    out.push({ date, description: description.slice(0, 300), amount, type });
  }
  return out;
}

// ---- PDF --------------------------------------------------------------------
// Lazy-load pdfjs only when needed (keeps the main bundle small).
let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then(async (pdfjs) => {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function pdfToLines(arrayBuffer) {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group text items into visual lines by their y-coordinate.
    const byLine = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      const key = `${p}:${y}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(item);
    }
    const sorted = [...byLine.entries()].sort((a, b) => {
      const ay = Number(a[0].split(":")[1]);
      const by = Number(b[0].split(":")[1]);
      return by - ay; // top to bottom
    });
    for (const [, items] of sorted) {
      items.sort((a, b) => a.transform[4] - b.transform[4]);
      const text = items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

// Best-effort line-based extraction. Bank PDFs vary widely, so anything we
// can't confidently parse is simply skipped (and what we do parse is flagged
// for review server-side when categorization is uncertain).
export async function parsePdf(arrayBuffer) {
  const lines = await pdfToLines(arrayBuffer);

  // Guess a statement year from a "Statement Period ... 2024" style line.
  let fallbackYear = new Date().getFullYear();
  for (const l of lines) {
    const ym = l.match(/\b(20\d{2})\b/);
    if (/statement|period|closing|through|date/i.test(l) && ym) {
      fallbackYear = Number(ym[1]); break;
    }
  }

  const dateRe = /^(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|[a-z]{3,}\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i;
  const amtRe = /(-?\(?\$?\s?[\d,]+\.\d{2}\)?-?)\s*$/;

  const out = [];
  for (const line of lines) {
    if (isStatementSummaryLine(line)) continue; // skip min-payment/balance rows
    const dm = line.match(dateRe);
    if (!dm) continue;
    const date = normalizeDate(dm[1], fallbackYear);
    if (!date) continue;
    const am = line.match(amtRe);
    if (!am) continue;
    const amount = parseAmount(am[1]);
    if (amount == null || amount === 0) continue;

    let description = line
      .slice(dm[0].length, line.length - am[0].length)
      .replace(/\s+/g, " ")
      .trim();
    // Strip a leading second date — transaction rows often show both a
    // transaction date and a posting date, e.g. "Apr 16  Apr 20  MERCHANT".
    description = description.replace(dateRe, "").trim();

    // A real transaction always has a merchant name. If the line reduces to no
    // letters it's statement scaffolding — most importantly the payment slip's
    // "Jun 04, 2026   $10.00" (minimum-payment-due) line, whose "Minimum
    // Payment" label sits on a separate line so the keyword filter can't see
    // it. Skip anything without an actual description.
    if (!/[a-z]/i.test(description)) continue;

    // On a credit-card statement a negative amount is a credit/refund (money
    // back), not a charge — treat it as income.
    const looksCredit = /\b(deposit|payroll|credit|refund|cash ?back|remise)\b/i.test(description);
    const type = amount < 0 ? "income" : looksCredit ? "income" : "expense";

    out.push({ date, description: description.slice(0, 300), amount: Math.abs(amount), type });
  }
  return { items: out, last4: detectLast4(lines.join("\n")) };
}

// ---- Dispatch ---------------------------------------------------------------
export async function parseStatementFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return parsePdf(await file.arrayBuffer()); // { items, last4 }
  }
  // CSV (or .txt fallback).
  const text = await file.text();
  return { items: parseCsv(text), last4: detectLast4(text) };
}
