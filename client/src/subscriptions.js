// Subscription helpers: auto-detect recurring charges from transactions, merge
// with the user's manual subscriptions, and compute monthly-equivalent cost.
import { shortenMerchant } from "./merchant.js";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stddev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Monthly-equivalent cost of one subscription.
export function monthlyCost(sub) {
  const amt = Number(sub.amount || 0);
  return sub.cadence === "annual" ? amt / 12 : amt;
}

// Auto-detect recurring charges: a merchant that recurs across ≥2 distinct
// months with consistent amounts, or anything tagged to the Subscriptions
// category. Returns [{ name, amount, cadence:"monthly", source:"auto" }].
export function detectSubscriptions(txns) {
  const groups = {};
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const name = shortenMerchant(t.description) || t.category || "Unknown";
    const key = name.toUpperCase();
    (groups[key] ||= { name, items: [], isSubCat: false });
    groups[key].items.push(t);
    if (t.category === "Subscriptions") groups[key].isSubCat = true;
  }

  const out = [];
  for (const g of Object.values(groups)) {
    const months = new Set(g.items.map((t) => String(t.date).slice(0, 7)));
    const amts = g.items.map((t) => Number(t.amount || 0));
    const spread = stddev(amts) / (mean(amts) || 1);
    const recurs = months.size >= 2 && spread < 0.2;
    if (recurs || g.isSubCat) {
      out.push({ name: g.name, amount: round2(median(amts)), cadence: "monthly", source: "auto" });
    }
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// Merge manual subscriptions with auto-detected ones (manual wins on name
// collision) and compute summary totals.
export function mergeSubscriptions(manual, txns) {
  const manualList = (manual || []).map((s) => ({ ...s, source: "manual" }));
  const manualNames = new Set(manualList.map((s) => s.name.toUpperCase()));
  const auto = detectSubscriptions(txns).filter((s) => !manualNames.has(s.name.toUpperCase()));
  const all = [...manualList, ...auto];

  const monthly = all.filter((s) => s.cadence !== "annual");
  const annual = all.filter((s) => s.cadence === "annual");
  const totalMonthly = round2(all.reduce((sum, s) => sum + monthlyCost(s), 0));

  return {
    all: all.sort((a, b) => monthlyCost(b) - monthlyCost(a)),
    monthlyCount: monthly.length,
    annualCount: annual.length,
    totalMonthly,
    totalAnnual: round2(totalMonthly * 12),
  };
}
