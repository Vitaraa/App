// Long-term financial projection math for the Foresight tab. Pure + testable.
// Monthly compounding throughout.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Future value of a starting principal plus a fixed monthly contribution,
// compounded monthly at an annual rate (in %), over `years`.
export function futureValue(principal, monthly, annualRatePct, years) {
  const P = Number(principal) || 0;
  const PMT = Number(monthly) || 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const n = Math.max(0, Math.round((Number(years) || 0) * 12));
  if (n === 0) return P;
  if (r === 0) return P + PMT * n;
  const g = Math.pow(1 + r, n);
  return P * g + PMT * ((g - 1) / r);
}

// Monthly contribution needed to reach `target` from `principal` in `years`.
// Returns 0 if the principal alone already gets there, Infinity if impossible
// in the time given.
export function requiredMonthly(principal, target, annualRatePct, years) {
  const P = Number(principal) || 0;
  const T = Number(target) || 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const n = Math.max(0, Math.round((Number(years) || 0) * 12));
  if (n === 0) return T <= P ? 0 : Infinity;
  if (r === 0) return Math.max(0, (T - P) / n);
  const g = Math.pow(1 + r, n);
  const pmt = (T - P * g) / ((g - 1) / r);
  return Math.max(0, pmt);
}

// Yearly projection points for charting: [{ year, value }].
export function projection(principal, monthly, annualRatePct, startYear, years) {
  const yrs = Math.max(0, Math.round(Number(years) || 0));
  const step = yrs > 30 ? 2 : 1;
  const out = [];
  for (let y = 0; y <= yrs; y += step) {
    out.push({ year: startYear + y, value: round2(futureValue(principal, monthly, annualRatePct, y)) });
  }
  if (!out.length || out[out.length - 1].year !== startYear + yrs) {
    out.push({ year: startYear + yrs, value: round2(futureValue(principal, monthly, annualRatePct, yrs)) });
  }
  return out;
}

// Analyze a plan: projected outcome, on-track status, required contribution,
// and feasibility. `monthlyIncome` caps what can realistically be contributed.
//   status: "reached" | "on-track" | "behind" | "impossible" | "impossible-time"
export function analyzePlan({ start, target, rate, years, contribution, monthlyIncome }) {
  const yrs = Number(years) || 0;
  const projected = futureValue(start, contribution, rate, yrs);
  const onTrack = projected >= target;
  const required = requiredMonthly(start, target, rate, yrs);
  const maxMonthly = monthlyIncome > 0 ? monthlyIncome : Infinity;

  let status;
  let feasible;
  if (yrs <= 0) {
    feasible = start >= target;
    status = feasible ? "reached" : "impossible-time";
  } else if (onTrack) {
    feasible = true;
    status = "on-track";
  } else if (required <= maxMonthly) {
    feasible = true;
    status = "behind"; // reachable by raising the monthly contribution to `required`
  } else {
    feasible = false;
    status = "impossible";
  }

  return {
    projected: round2(projected),
    onTrack,
    required: Number.isFinite(required) ? round2(required) : Infinity,
    shortfall: round2(Math.max(0, target - projected)),
    surplusVsTarget: round2(projected - target),
    feasible,
    status,
    maxMonthly: Number.isFinite(maxMonthly) ? round2(maxMonthly) : null,
  };
}

// What a recurring monthly saving, invested, grows to over `years`.
export function compoundedSaving(monthlySaving, annualRatePct, years) {
  return round2(futureValue(0, monthlySaving, annualRatePct, years));
}

// The first calendar year the accumulating balance reaches `target` (or null if
// it never does within `horizonYears`). Used to place a goal marker on the line
// at the year it's actually achieved — earlier than the deadline if ahead.
export function crossingYear(start, monthly, annualRatePct, startYear, target, horizonYears) {
  for (let y = 0; y <= horizonYears; y++) {
    if (futureValue(start, monthly, annualRatePct, y) >= target) return startYear + y;
  }
  return null;
}

// Whole-life balance, year by year: accumulate (with monthly contributions)
// until `retirementYear`, then draw down `retirementSpending` per month until
// `lifeYear`. Balance can go negative (running out of money / into debt).
// Returns [{ year, value }].
export function lifeProjection({ start, monthly, rate, startYear, retirementYear, lifeYear, retirementSpending }) {
  const r = (Number(rate) || 0) / 100 / 12;
  const draw = Number(retirementSpending) || 0;
  const pmt = Number(monthly) || 0;
  let bal = Number(start) || 0;
  const end = Math.max(startYear + 1, Number(lifeYear) || startYear, Number(retirementYear) || startYear);
  const out = [{ year: startYear, value: round2(bal) }];
  for (let y = startYear + 1; y <= end; y++) {
    for (let m = 0; m < 12; m++) {
      bal = bal * (1 + r);
      if (retirementYear && y > retirementYear) bal -= draw;
      else bal += pmt;
    }
    out.push({ year: y, value: round2(bal) });
  }
  return out;
}

// First year the series dips below zero (runs out of money), or null.
export function runsOutYear(series) {
  const hit = (series || []).find((p) => p.value < 0);
  return hit ? hit.year : null;
}
