// Time-series helpers for the dashboard charts. Pure functions, unit-testable.
//
// Granularity is one of "day" | "month" | "year". Each series entry is
// { period, label, value } sorted chronologically.

export function bucketKey(date, granularity) {
  const s = String(date);
  if (granularity === "year") return s.slice(0, 4); // YYYY
  if (granularity === "day") return s.slice(0, 10); // YYYY-MM-DD
  return s.slice(0, 7); // YYYY-MM (month, default)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(key, granularity) {
  if (granularity === "year") return key;
  if (granularity === "day") {
    const [, m, d] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  }
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${String(y).slice(2)}`;
}

// Total spending (expenses) per period.
export function spendingSeries(txns, granularity) {
  const map = {};
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const k = bucketKey(t.date, granularity);
    map[k] = (map[k] || 0) + Number(t.amount || 0);
  }
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ period: k, label: periodLabel(k, granularity), value: round2(map[k]) }));
}

// Income vs expense (and net) per period — for the Cash Flow page.
export function cashFlowSeries(txns, granularity) {
  const map = {};
  for (const t of txns) {
    const k = bucketKey(t.date, granularity);
    (map[k] ||= { income: 0, expense: 0 });
    if (t.type === "income") map[k].income += Number(t.amount || 0);
    else map[k].expense += Number(t.amount || 0);
  }
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({
      period: k,
      label: periodLabel(k, granularity),
      income: round2(map[k].income),
      expense: round2(map[k].expense),
      net: round2(map[k].income - map[k].expense),
    }));
}

// Cumulative net balance (income − expense) sampled at the end of each period.
// If `anchorTotal` is provided, the whole curve is shifted so the final point
// equals that value — used for the "from accounts" net-worth view, which anchors
// the running balance to the user's real current net worth.
export function netWorthSeries(txns, granularity, anchorTotal = null) {
  const sorted = [...txns].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let running = 0;
  const endOfPeriod = {};
  for (const t of sorted) {
    running += t.type === "income" ? Number(t.amount || 0) : -Number(t.amount || 0);
    endOfPeriod[bucketKey(t.date, granularity)] = running;
  }
  let series = Object.keys(endOfPeriod)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ period: k, label: periodLabel(k, granularity), value: endOfPeriod[k] }));

  if (anchorTotal != null && series.length) {
    const shift = anchorTotal - series[series.length - 1].value;
    series = series.map((p) => ({ ...p, value: round2(p.value + shift) }));
  } else {
    series = series.map((p) => ({ ...p, value: round2(p.value) }));
  }
  return series;
}

// Current net worth from accounts: assets minus liabilities. Uses the
// server-computed `value` when present (investment accounts price their
// holdings live); otherwise the stored balance.
export function accountsNetWorth(accounts) {
  return round2(
    (accounts || []).reduce((sum, a) => {
      const v = a.value != null ? Number(a.value) : Number(a.balance || 0);
      return sum + (a.kind === "liability" ? -v : v);
    }, 0)
  );
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
