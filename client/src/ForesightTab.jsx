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
  ReferenceLine,
} from "recharts";
import { api } from "./api.js";
import PageActions from "./PageActions.jsx";
import { accountGroup, kindForGroup } from "./institutions.js";
import { analyzePlan, lifeProjection, runsOutYear, compoundedSaving } from "./foresight.js";

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
  const [settings, setSettings] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const currentYear = new Date().getFullYear();

  async function load() {
    try {
      const [p, a, s] = await Promise.all([api.listPlans(), api.listAccounts(), api.getSettings()]);
      setPlans(p);
      setAccounts(a);
      setSettings(s);
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
  const { monthlyIncome, monthlyExpense, surplus } = useMemo(() => {
    const months = new Set();
    let inc = 0;
    let exp = 0;
    for (const t of txns) {
      months.add(String(t.date).slice(0, 7));
      if (t.type === "income") inc += Number(t.amount || 0);
      else exp += Number(t.amount || 0);
    }
    const n = Math.max(1, months.size);
    return { monthlyIncome: inc / n, monthlyExpense: exp / n, surplus: Math.max(0, (inc - exp) / n) };
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

  // "About you" inputs (user-level, stored in settings).
  const age = Number(settings.fs_age) || 30;
  const lifeExp = Number(settings.fs_life) || 90;
  const retireSpending = settings.fs_spend != null && settings.fs_spend !== ""
    ? Number(settings.fs_spend)
    : Math.round(monthlyExpense) || 4000;
  const lifeYear = currentYear + Math.max(1, lifeExp - age);

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;

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
  const sel = plan ? analyzeOf(plan) : null;

  // Whole-life balance line for the selected plan (accumulate, then draw down
  // after retirement), with each plan placed as a marker ON the line.
  const chart = useMemo(() => {
    if (!plan || !sel) return null;
    const xMax = Math.max(lifeYear, currentYear + 1, ...plans.map((p) => p.target_year || 0));
    const retirementYear = plan.kind === "retirement" ? plan.target_year : null;
    const series = lifeProjection({
      start: sel.start,
      monthly: sel.contribution,
      rate: plan.return_rate,
      startYear: currentYear,
      retirementYear,
      lifeYear: xMax,
      retirementSpending: retireSpending,
    }).map((p) => ({ year: p.year, Projected: p.value }));

    const valueAt = (yr) => {
      let v = series[0] ? series[0].Projected : 0;
      for (const p of series) {
        if (p.year <= yr) v = p.Projected;
        else break;
      }
      return v;
    };
    const crossing = (target) => {
      for (const p of series) if (p.Projected >= target) return p.year;
      return null;
    };

    const markers = plans.map((p) => {
      const deadline = p.target_year || currentYear;
      const cross = crossing(p.target_amount);
      if (cross != null && cross <= deadline) {
        return { id: p.id, name: p.name, x: cross, y: p.target_amount, color: "var(--green)", status: `on track — reaches ${fmt(p.target_amount)} in ${cross}` };
      }
      const v = valueAt(deadline);
      if (cross != null) {
        return { id: p.id, name: p.name, x: deadline, y: v, color: "#fbbf24", status: `reaches ${fmt(p.target_amount)} in ${cross}, after your ${deadline} target` };
      }
      return { id: p.id, name: p.name, x: deadline, y: v, color: "var(--red)", status: `${fmt(Math.max(0, p.target_amount - v))} short by ${deadline}` };
    });

    const ro = runsOutYear(series.map((p) => ({ year: p.year, value: p.Projected })));
    const selMarker = markers.find((m) => m.id === plan.id);
    const lineColor = ro ? "var(--red)" : selMarker ? selMarker.color : "var(--accent)";
    return { series, markers, xMax, ro, lineColor };
  }, [plan, sel, plans, currentYear, lifeYear, retireSpending, netWorth, surplus, monthlyIncome]);

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
    const p = await api.addPlan({ name: "Retirement", kind: "retirement", target_amount: 1000000, target_year: currentYear + 30, return_rate: 7 });
    setSelectedId(p.id);
    setEditing(true);
    load();
  }
  async function patch(field, value) {
    if (!plan) return;
    await api.updatePlan(plan.id, { [field]: value });
    load();
  }
  async function saveSetting(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
    await api.setSetting(key, value);
  }
  async function remove() {
    if (!plan) return;
    await api.deletePlan(plan.id);
    setEditing(false);
    setSelectedId(null);
    load();
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
                <button key={p.id} className={`chip ${plan && p.id === plan.id ? "chip-on" : ""}`} onClick={() => setSelectedId(p.id)}>
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
              <div className="plan-grid about-you">
                <label className="field"><span>Your age</span><input type="number" defaultValue={settings.fs_age ?? ""} placeholder="30" key={`age${plan.id}`} onBlur={(e) => saveSetting("fs_age", e.target.value)} /></label>
                <label className="field"><span>Life expectancy (age)</span><input type="number" defaultValue={settings.fs_life ?? ""} placeholder="90" key={`life${plan.id}`} onBlur={(e) => saveSetting("fs_life", e.target.value)} /></label>
                <label className="field"><span>Retirement spending / mo</span><input type="number" defaultValue={settings.fs_spend ?? ""} placeholder={fmt(retireSpending)} key={`spend${plan.id}`} onBlur={(e) => saveSetting("fs_spend", e.target.value)} /></label>
              </div>
            </section>
          )}

          {plan && sel && chart && (
            <>
              <section className="card chart-card">
                <div className="widget-head">
                  <div>
                    <span className="muted">Lifetime balance</span>
                    <div className="widget-value">{fmt(sel.projected)}<span className="muted unit"> by {plan.target_year || currentYear}</span></div>
                  </div>
                </div>
                {chart.series.length <= 1 ? (
                  <p className="muted empty">Set a future target year and your age to see the projection.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chart.series} margin={{ top: 16, right: 20, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="year" type="number" domain={[currentYear, chart.xMax]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                      <Tooltip formatter={(v) => fmtc(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} />
                      <Line type="monotone" dataKey="Projected" stroke={chart.lineColor} strokeWidth={2.5} dot={false} />
                      {chart.markers.map((m) => (
                        <ReferenceDot key={m.id} x={m.x} y={m.y} r={6} fill={m.color} stroke="var(--card)" strokeWidth={2} ifOverflow="extendDomain" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <ul className="foresight-legend">
                  {chart.markers.map((m) => (
                    <li key={m.id}>
                      <span className="legend-dot" style={{ background: m.color }} />
                      <strong>{m.name}</strong>
                      <span className="muted"> — {m.status}</span>
                    </li>
                  ))}
                  {chart.ro && (
                    <li>
                      <span className="legend-dot" style={{ background: "var(--red)" }} />
                      <span className="neg">Runs out of money in {chart.ro}</span>
                      <span className="muted"> — at {fmtc(retireSpending)}/mo in retirement you'd go into debt.</span>
                    </li>
                  )}
                </ul>
              </section>

              {sel.status !== "reached" && sel.years > 0 && (
                <section className="card contrib-card">
                  <span className="muted">To stay on the projected path</span>
                  <div className="contrib-amount">{fmt(monthlyPlan)}<span className="muted unit"> / month</span></div>
                  <p className="muted">
                    Set aside about {fmtc(monthlyPlan)} each month toward <strong>{plan.name}</strong>
                    {sel.status === "behind" ? ` (up from your current ${fmtc(sel.contribution)})` : ""} — invested at your plan's {plan.return_rate}% return.
                    Keeping it in an investment account (not a chequing account) is what earns that growth.
                    {sel.status === "impossible" ? " Note: this is more than your current income, so this goal isn't reachable as set." : ""}
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
