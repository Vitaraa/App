import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
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
  const currentYear = new Date().getFullYear();

  async function load() {
    try {
      const [p, a] = await Promise.all([api.listPlans(), api.listAccounts()]);
      setPlans(p);
      setAccounts(a);
      setSelectedId((cur) => cur ?? (p[0] ? p[0].id : null));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Current finances derived from accounts + transactions.
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

  // Average monthly spend per category, for cut recommendations.
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

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;

  async function newPlan() {
    const p = await api.addPlan({
      name: "Retirement",
      kind: "retirement",
      target_amount: 1000000,
      target_year: currentYear + 30,
      return_rate: 7,
    });
    setSelectedId(p.id);
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
    setSelectedId(null);
    load();
  }

  // Analysis for the selected plan.
  const analysis = useMemo(() => {
    if (!plan) return null;
    const start = plan.start_amount != null ? plan.start_amount : netWorth;
    const contribution = plan.monthly_contribution != null ? plan.monthly_contribution : surplus;
    const years = (plan.target_year || currentYear) - currentYear;
    const a = analyzePlan({
      start,
      target: plan.target_amount,
      rate: plan.return_rate,
      years,
      contribution,
      monthlyIncome,
    });
    const series = projection(start, contribution, plan.return_rate, currentYear, years);
    const reqSeries =
      a.status === "behind" ? projection(start, a.required, plan.return_rate, currentYear, years) : null;
    const chartData = series.map((pt, i) => ({
      year: pt.year,
      Projected: pt.value,
      Required: reqSeries ? (reqSeries[i] ? reqSeries[i].value : undefined) : undefined,
    }));
    return { ...a, start, contribution, years, chartData };
  }, [plan, netWorth, surplus, monthlyIncome, currentYear]);

  const recs = useMemo(() => {
    if (!analysis || analysis.years <= 0) return [];
    return catMonthly
      .filter((c) => c.monthly >= 20)
      .slice(0, 4)
      .map((c) => {
        const saving = c.monthly * 0.25;
        return {
          cat: c.cat,
          monthly: c.monthly,
          saving,
          grows: compoundedSaving(saving, plan.return_rate, analysis.years),
        };
      });
  }, [catMonthly, analysis, plan]);

  function statusBanner() {
    if (!analysis) return null;
    const yr = plan.target_year || currentYear;
    const map = {
      "on-track": {
        cls: "good",
        text: `On track — projected ${fmt(analysis.projected)} by ${yr}, about ${fmt(analysis.surplusVsTarget)} above your ${fmt(plan.target_amount)} goal.`,
      },
      behind: {
        cls: "warn",
        text: `Behind — projected ${fmt(analysis.projected)}, ${fmt(analysis.shortfall)} short. Raise your monthly contribution from ${fmt(analysis.contribution)} to about ${fmt(analysis.required)}/mo (within your ~${fmt(monthlyIncome)}/mo income) to reach it.`,
      },
      impossible: {
        cls: "bad",
        text: `Not realistic — reaching ${fmt(plan.target_amount)} by ${yr} would need about ${fmt(analysis.required)}/mo, far more than your ~${fmt(monthlyIncome)}/mo income. Try a later year, a smaller target, or growing your income.`,
      },
      reached: {
        cls: "good",
        text: `Already there — your starting amount already meets this goal.`,
      },
      "impossible-time": {
        cls: "bad",
        text: `Set a target year in the future to project this goal.`,
      },
    };
    const m = map[analysis.status] || map["impossible-time"];
    return <div className={`foresight-status ${m.cls}`}>{m.text}</div>;
  }

  return (
    <div className="foresight-tab">
      <PageActions>
        <button className="btn primary sm" onClick={newPlan}>+ New plan</button>
      </PageActions>

      {plans.length === 0 ? (
        <section className="card">
          <p className="muted">
            Plan a long-term goal — retirement, a house, anything. Click <strong>+ New plan</strong> to start,
            and Foresight will project whether you're on track and where you could cut back to get there faster.
          </p>
        </section>
      ) : (
        <>
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

          {plan && analysis && (
            <>
              {statusBanner()}

              <section className="card">
                <div className="plan-grid">
                  <label className="field">
                    <span>Goal name</span>
                    <input defaultValue={plan.name} key={`n${plan.id}`} onBlur={(e) => patch("name", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select value={plan.kind} onChange={(e) => patch("kind", e.target.value)}>
                      {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Target amount</span>
                    <input type="number" defaultValue={plan.target_amount} key={`t${plan.id}`} onBlur={(e) => patch("target_amount", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Target year</span>
                    <input type="number" defaultValue={plan.target_year || ""} key={`y${plan.id}`} onBlur={(e) => patch("target_year", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Expected return % / yr</span>
                    <input type="number" step="0.1" defaultValue={plan.return_rate} key={`r${plan.id}`} onBlur={(e) => patch("return_rate", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Starting amount</span>
                    <input type="number" defaultValue={plan.start_amount ?? ""} placeholder={`Net worth ${fmt(netWorth)}`} key={`s${plan.id}`} onBlur={(e) => patch("start_amount", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Monthly contribution</span>
                    <input type="number" defaultValue={plan.monthly_contribution ?? ""} placeholder={`Surplus ${fmt(surplus)}`} key={`c${plan.id}`} onBlur={(e) => patch("monthly_contribution", e.target.value)} />
                  </label>
                  <div className="field plan-delete">
                    <span>&nbsp;</span>
                    <button className="btn ghost sm" onClick={remove}>Delete plan</button>
                  </div>
                </div>
              </section>

              <section className="card chart-card">
                <div className="widget-head">
                  <div>
                    <span className="muted">Projected vs target</span>
                    <div className="widget-value">{fmt(analysis.projected)}<span className="muted unit"> by {plan.target_year || currentYear}</span></div>
                  </div>
                </div>
                {analysis.chartData.length <= 1 ? (
                  <p className="muted empty">Set a future target year to see the projection.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analysis.chartData} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                      <Tooltip formatter={(v) => fmtc(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine y={plan.target_amount} stroke="var(--accent)" strokeDasharray="6 4" label={{ value: "Target", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} />
                      <Line type="monotone" dataKey="Projected" stroke={analysis.onTrack ? "var(--green)" : "var(--red)"} strokeWidth={2.5} dot={false} />
                      {analysis.status === "behind" && (
                        <Line type="monotone" dataKey="Required" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </section>

              <section className="card">
                <span className="muted">Where you could cut back</span>
                {recs.length === 0 ? (
                  <p className="muted empty sm">Not enough spending data yet, or this goal needs a future target year.</p>
                ) : (
                  <ul className="rec-list">
                    {recs.map((r) => (
                      <li key={r.cat} className="rec">
                        <span className="rec-text">
                          Trim 25% off <strong>{r.cat}</strong> (~{fmtc(r.saving)}/mo of your {fmtc(r.monthly)}/mo)
                        </span>
                        <span className="rec-grow pos">→ ~{fmt(r.grows)} by {plan.target_year || currentYear}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted hint-sm">Estimates assume the saved amount is invested at your plan's return rate.</p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
