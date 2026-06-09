// Live stock-quote fetching for investment holdings.
//
// Provider order:
//   1. Finnhub  — used when STOCK_API_KEY (or FINNHUB_API_KEY) is set. Free tier
//      is generous (~60 req/min). https://finnhub.io
//   2. Yahoo Finance chart endpoint — no key required, used as the default /
//      fallback. Unofficial, so it can change or rate-limit.
//
// Quotes are cached in memory for QUOTE_TTL to respect rate limits — a personal
// budgeting app doesn't need second-by-second prices.

const QUOTE_TTL = 15 * 60 * 1000; // 15 minutes
const cache = new Map(); // SYMBOL -> { price, ts }

const FINNHUB_KEY = process.env.STOCK_API_KEY || process.env.FINNHUB_API_KEY || "";

// fetch with a hard timeout so a slow/unreachable provider can't hang the
// account-listing request that calls into here.
async function fetchWithTimeout(url, opts = {}, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFinnhub(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`finnhub ${r.status}`);
  const j = await r.json();
  if (typeof j.c === "number" && j.c > 0) return j.c; // current price
  throw new Error("finnhub: no price");
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=1d`;
  const r = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price === "number" && price > 0) return price;
  throw new Error("yahoo: no price");
}

// Returns the current price for one symbol, or null if it can't be resolved.
export async function getQuote(symbol) {
  const sym = String(symbol || "").toUpperCase().trim();
  if (!sym) return null;

  const cached = cache.get(sym);
  if (cached && Date.now() - cached.ts < QUOTE_TTL) return cached.price;

  let price = null;
  try {
    price = FINNHUB_KEY ? await fetchFinnhub(sym) : await fetchYahoo(sym);
  } catch {
    // Fall back to the other provider (Yahoo) if the primary failed.
    if (FINNHUB_KEY) {
      try {
        price = await fetchYahoo(sym);
      } catch {
        price = null;
      }
    }
  }

  if (price != null) {
    cache.set(sym, { price, ts: Date.now() });
    return price;
  }
  // On failure, serve a stale cached value if we have one.
  return cached ? cached.price : null;
}

// Returns { SYMBOL: price|null } for a list of symbols (deduplicated).
export async function getQuotes(symbols) {
  const uniq = [
    ...new Set((symbols || []).map((s) => String(s || "").toUpperCase().trim()).filter(Boolean)),
  ];
  const entries = await Promise.all(uniq.map(async (s) => [s, await getQuote(s)]));
  return Object.fromEntries(entries);
}

export const quoteProvider = FINNHUB_KEY ? "finnhub" : "yahoo";
