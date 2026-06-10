import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
  Legend,
} from "recharts";
import { api } from "./api.js";
import PageActions from "./PageActions.jsx";
import { accountGroup, kindForGroup } from "./institutions.js";
import { analyzePlan, projection, compoundedSaving } from "./foresight.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtc = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

const KINDS = [
  { key: "retirement", label: "Retirement" },
  { key: "house", label: "House purchase" },
  { key: "custom", label: "Custom" },
];

export default function ForesightTab({ txns = [] }) {
  const [plans, setPlans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const currentYear = new Date().getFullYear();

  async function load() {
    try {
      const [p, a] = await Promise.all([api.listPlans(), api.listAccounts()]);
      setPlans(p);
      setAccounts(a);
      setSelectedId((cur) => (p.some((x) => x.id === cur) ? cur : p[0] ? p[0].id : null));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  const netWorth = useMemo(
    () =>
      accounts.reduce((s, a) => {
        const v = acctValue(a);
        return s + (kindForGroup(accountGroup(a)) === "liability" ? -v : v);
      }, 0),
    [accounts]
  );
  const { monthlyIncome, surplus } = useMemo(() => {
    const months = new Set();
    let inc = 0;
    let exp = 0;
    for (const t of txns) {
      months.add(String(t.date).slice(0, 7));
      if (t.type === "income") inc += Number(t.amount || 0);
      else exp += Number(t.amount || 0);
    }
    const n = Math.max(1, months.size);
    return { monthlyIncome: inc / n, surplus: Math.max(0, (inc - exp) / n) };
  }, [txns]);

  const catMonthly = useMemo(() => {
    const months = new Set();
    const byCat = {};
    for (const t of txns) {
      if (t.type !== "expense") continue;
      months.add(String(t.date).slice(0, 7));
      byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount || 0);
    }
    const n = Math.max(1, months.size);
    return Object.entries(byCat)
      .map(([cat, total]) => ({ cat, monthly: total / n }))
      .sort((a, b) => b.monthly - a.monthly);
  }, [txns]);

  // Analyze any plan with the user's current finances.
  function analyzeOf(p) {
    const start = p.start_amount != null ? p.start_amount : netWorth;
    const contribution = p.monthly_contribution != null ? p.monthly_contribution : surplus;
    const years = (p.target_year || currentYear) - currentYear;
    return {
      ...analyzePlan({ start, target: p.target_amount, rate: p.return_rate, years, contribution, monthlyIncome }),
      start,
      contribution,
      years,
    };
  }

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;
  const sel = plan ? analyzeOf(plan) : null;

  // One projected line (the selected plan) spanning to the furthest goal year,
  // with each plan shown as an icon (dot) at its target rather than a
  // horizontal target line.
  const chart = useMemo(() => {
    if (!plan || !sel) return null;
    const maxYear = Math.max(
      currentYear + 1,
      ...plans.map((p) => p.target_year || currentYear).filter((y) => y > currentYear)
    );
    const span = maxYear - currentYear;
    const data = projection(sel.start, sel.contribution, plan.return_rate, currentYear, span).map((pt) => ({
      year: pt.year,
      Projected: pt.value,
    }));
    const dots = plans
      .filter((p) => (p.target_year || 0) > currentYear && (p.target_year || 0) <= maxYear)
      .map((p) => {
        const a = analyzeOf(p);
        const fill = a.onTrack ? "var(--green)" : a.feasible ? "#fbbf24" : "var(--red)";
        return { id: p.id, name: p.name, x: p.target_year, y: p.target_amount, fill };
      });
    return { data, dots, maxYear };
  }, [plan, sel, plans, currentYear, netWorth, surplus, monthlyIncome]);

  const recs = useMemo(() => {
    if (!sel || sel.years <= 0) return [];
    return catMonthly
      .filter((c) => c.monthly >= 20)
      .slice(0, 4)
      .map((c) => {
        const saving = c.monthly * 0.25;
        return { cat: c.cat, monthly: c.monthly, saving, grows: compoundedSaving(saving, plan.return_rate, sel.years) };
      });
  }, [catMonthly, sel, plan]);

  async function newPlan() {
    const p = await api.addPlan({
      name: "Retirement",
      kind: "retirement",
      target_amount: 1000000,
      target_year: currentYear + 30,
      return_rate: 7,
    });
    setSelectedId(p.id);
    setEditing(true);
    load();
  }
  async function patch(field, value) {
    if (!plan) return;
    await api.updatePlan(plan.id, { [field]: value });
    load();
  }
  async function remove() {
    if (!plan) return;
    await api.deletePlan(plan.id);
    setEditing(false);
    setSelectedId(null);
    load();
  }

  function statusBanner() {
    if (!sel) return null;
    const yr = plan.target_year || currentYear;
    const map = {
      "on-track": { cls: "good", text: `On track — projected ${fmt(sel.projected)} by ${yr}, about ${fmt(sel.surplusVsTarget)} above your ${fmt(plan.target_amount)} goal.` },
      behind: { cls: "warn", text: `Behind — projected ${fmt(sel.projected)}, ${fmt(sel.shortfall)} short of your ${fmt(plan.target_amount)} goal. It's still reachable by saving more (see below).` },
      impossible: { cls: "bad", text: `Not realistic — reaching ${fmt(plan.target_amount)} by ${yr} would need about ${fmt(sel.required)}/mo, far more than your ~${fmt(monthlyIncome)}/mo income. Try a later year, a smaller target, or growing your income.` },
      reached: { cls: "good", text: `Already there — your starting amount already meets this goal.` },
      "impossible-time": { cls: "bad", text: `Set a target year in the future to project this goal.` },
    };
    const m = map[sel.status] || map["impossible-time"];
    return <div className={`foresight-status ${m.cls}`}>{m.text}</div>;
  }

  const monthlyPlan = sel ? (sel.status === "on-track" || sel.status === "reached" ? sel.contribution : sel.required) : 0;

  return (
    <div className="foresight-tab">
      <PageActions>
        {plan && (
          <button className="btn ghost sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit plan"}
          </button>
        )}
        <button className="btn primary sm" onClick={newPlan}>+ New plan</button>
      </PageActions>

      {plans.length === 0 ? (
        <section className="card">
          <p className="muted">No plans yet — add one to project a long-term goal.</p>
        </section>
      ) : (
        <>
          {plans.length > 1 && (
            <div className="plan-tabs">
              {plans.map((p) => (
                <button
                  key={p.id}
                  className={`chip ${plan && p.id === plan.id ? "chip-on" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {editing && plan && (
            <section className="card">
              <div className="plan-grid">
                <label className="field"><span>Goal name</span><input defaultValue={plan.name} key={`n${plan.id}`} onBlur={(e) => patch("name", e.target.value)} /></label>
                <label className="field"><span>Type</span><select value={plan.kind} onChange={(e) => patch("kind", e.target.value)}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
                <label className="field"><span>Target amount</span><input type="number" defaultValue={plan.target_amount} key={`t${plan.id}`} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                <label className="field"><span>Target year</span><input type="number" defaultValue={plan.target_year || ""} key={`y${plan.id}`} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                <label className="field"><span>Expected return % / yr</span><input type="number" step="0.1" defaultValue={plan.return_rate} key={`r${plan.id}`} onBlur={(e) => patch("return_rate", e.target.value)} /></label>
                <label className="field"><span>Starting amount</span><input type="number" defaultValue={plan.start_amount ?? ""} placeholder={`Net worth ${fmt(netWorth)}`} key={`s${plan.id}`} onBlur={(e) => patch("start_amount", e.target.value)} /></label>
                <label className="field"><span>Monthly contribution</span><input type="number" defaultValue={plan.monthly_contribution ?? ""} placeholder={`Surplus ${fmt(surplus)}`} key={`c${plan.id}`} onBlur={(e) => patch("monthly_contribution", e.target.value)} /></label>
                <div className="field plan-delete"><span>&nbsp;</span><button className="btn ghost sm" onClick={remove}>Delete plan</button></div>
              </div>
            </section>
          )}

          {plan && sel && (
            <>
              <section className="card chart-card">
                <div className="widget-head">
                  <div>
                    <span className="muted">Projected balance</span>
                    <div className="widget-value">{fmt(sel.projected)}<span className="muted unit"> by {plan.target_year || currentYear}</span></div>
                  </div>
                </div>
                {!chart || chart.data.length <= 1 ? (
                  <p className="muted empty">Set a future target year to see the projection.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chart.data} margin={{ top: 16, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="year" type="number" domain={[currentYear, chart.maxYear]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                      <Tooltip formatter={(v) => fmtc(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Projected" stroke={sel.onTrack ? "var(--green)" : "var(--red)"} strokeWidth={2.5} dot={false} />
                      {chart.dots.map((d) => (
                        <ReferenceDot
                          key={d.id}
                          x={d.x}
                          y={d.y}
                          r={6}
                          fill={d.fill}
                          stroke="var(--card)"
                          strokeWidth={2}
                          label={{ value: d.name, position: "top", fill: "var(--muted)", fontSize: 11 }}
                          ifOverflow="extendDomain"
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <p className="muted hint-sm">Each dot is a goal: green if on track, amber if reachable by saving more, red if out of reach.</p>
              </section>

              {statusBanner()}

              {sel.status !== "reached" && sel.years > 0 && (
                <section className="card contrib-card">
                  <span className="muted">To stay on the projected path</span>
                  <div className="contrib-amount">
                    {fmt(monthlyPlan)}<span className="muted unit"> / month</span>
                  </div>
                  <p className="muted">
                    Set aside about {fmtc(monthlyPlan)} each month toward <strong>{plan.name}</strong>
                    {sel.status === "behind" ? " (up from your current " + fmtc(sel.contribution) + ")" : ""} — investing it at your
                    plan's {plan.return_rate}% return keeps you on the line above. Putting it in an investment account
                    (rather than a chequing account) is what earns that growth.
                    {sel.status === "impossible" ? " Note: this exceeds your current income, so this goal isn't reachable as set." : ""}
                  </p>
                </section>
              )}

              <section className="card">
                <span className="muted">Where you could cut back</span>
                {recs.length === 0 ? (
                  <p className="muted empty sm">Not enough spending data yet, or this goal needs a future target year.</p>
                ) : (
                  <ul className="rec-list">
                    {recs.map((r) => (
                      <li key={r.cat} className="rec">
                        <span className="rec-text">Trim 25% off <strong>{r.cat}</strong> (~{fmtc(r.saving)}/mo of your {fmtc(r.monthly)}/mo)</span>
                        <span className="rec-grow pos">→ ~{fmt(r.grows)} by {plan.target_year || currentYear}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
