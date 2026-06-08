// Derives summary insights from a list of transactions for the summary box:
//  - abnormally large purchases (statistical outliers among expenses)
//  - recurring charges (same merchant, regular cadence — likely subscriptions)
//  - top spending categories this month and month-over-month change
//
// Pure functions, no React — easy to unit-test.

const monthKey = (d) => String(d).slice(0, 7);

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Group expenses by a normalized merchant key to detect recurring charges.
function merchantKey(t) {
  const base = (t.description || t.category || "")
    .toUpperCase()
    .replace(/[#*]/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.split(" ").slice(0, 3).join(" ") || t.category || "Other";
}

export function computeInsights(txns) {
  const expenses = txns.filter((t) => t.type === "expense");
  const insights = [];

  // --- Abnormally large purchases -------------------------------------------
  const amounts = expenses.map((t) => t.amount);
  if (amounts.length >= 4) {
    const m = mean(amounts);
    const sd = stddev(amounts);
    const med = median(amounts);
    // Outlier = well above the typical purchase (mean + 2σ) and ≥3× the median.
    const threshold = Math.max(m + 2 * sd, med * 3, 0);
    const outliers = expenses
      .filter((t) => t.amount >= threshold && t.amount > med * 1.5)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
    for (const o of outliers) {
      insights.push({
        kind: "outlier",
        severity: "warn",
        text: `Unusually large ${o.category.toLowerCase()} charge of ${money(o.amount)} on ${o.date}` +
          (o.description ? ` (${cleanDesc(o.description)})` : "") +
          ` — about ${(o.amount / (med || 1)).toFixed(1)}× your typical spend.`,
      });
    }
  }

  // --- Recurring / subscription detection -----------------------------------
  const groups = {};
  for (const t of expenses) {
    const k = merchantKey(t);
    (groups[k] ||= []).push(t);
  }
  for (const [k, items] of Object.entries(groups)) {
    if (items.length < 3) continue;
    // Similar amounts across ≥3 distinct months => likely a recurring charge.
    const months = new Set(items.map((t) => monthKey(t.date)));
    const amts = items.map((t) => t.amount);
    const spread = stddev(amts) / (mean(amts) || 1);
    if (months.size >= 3 && spread < 0.15) {
      insights.push({
        kind: "recurring",
        severity: "info",
        text: `Recurring charge: ${titleCase(k)} ~${money(median(amts))}/mo across ${months.size} months (≈${money(median(amts) * 12)}/yr).`,
      });
    }
  }

  // --- Month-over-month spending --------------------------------------------
  const byMonth = {};
  for (const t of expenses) {
    const k = monthKey(t.date);
    byMonth[k] = (byMonth[k] || 0) + t.amount;
  }
  const months = Object.keys(byMonth).sort();
  if (months.length >= 2) {
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    const diff = byMonth[cur] - byMonth[prev];
    const pct = byMonth[prev] ? (diff / byMonth[prev]) * 100 : 0;
    if (Math.abs(pct) >= 15) {
      insights.push({
        kind: "trend",
        severity: diff > 0 ? "warn" : "good",
        text: `Spending is ${diff > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% this month (${money(byMonth[cur])} vs ${money(byMonth[prev])} last month).`,
      });
    }
  }

  // --- Top category this month ----------------------------------------------
  if (months.length) {
    const cur = months[months.length - 1];
    const catTotals = {};
    for (const t of expenses) {
      if (monthKey(t.date) !== cur) continue;
      catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    }
    const top = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(catTotals).reduce((a, b) => a + b, 0);
    if (top && total > 0) {
      insights.push({
        kind: "top",
        severity: "info",
        text: `Top category this month: ${top[0]} at ${money(top[1])} (${((top[1] / total) * 100).toFixed(0)}% of spending).`,
      });
    }
  }

  // --- Review reminder ------------------------------------------------------
  const review = txns.filter((t) => t.needs_review).length;
  if (review > 0) {
    insights.push({
      kind: "review",
      severity: "warn",
      text: `${review} transaction${review > 1 ? "s need" : " needs"} a category — look for the ⚠ flag below.`,
    });
  }

  if (!insights.length) {
    insights.push({
      kind: "empty",
      severity: "info",
      text: "No unusual patterns detected. Import a statement or add transactions to see insights.",
    });
  }
  // Warnings first, then info, then good news.
  const order = { warn: 0, info: 1, good: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 7);
}

function money(n) {
  return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function cleanDesc(d) {
  return String(d).replace(/\s+/g, " ").trim().slice(0, 40);
}
function titleCase(s) {
  return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
