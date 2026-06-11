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
import { analyzePlan, simulateNetWorth, runsOutYear, mortgagePayment, compoundedSaving } from "./foresight.js";

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

  const age = Number(settings.fs_age) || 30;
  const lifeExp = Number(settings.fs_life) || 90;
  const retireSpending =
    settings.fs_spend != null && settings.fs_spend !== "" ? Number(settings.fs_spend) : Math.round(monthlyExpense) || 4000;
  const currentHousing = settings.fs_housing != null && settings.fs_housing !== "" ? Number(settings.fs_housing) : 0;
  const lifeYear = currentYear + Math.max(1, lifeExp - age);

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;

  function analyzeSavings(p) {
    const years = (p.target_year || currentYear) - currentYear;
    return {
      ...analyzePlan({ start: netWorth, target: p.target_amount, rate: p.return_rate, years, contribution: surplus, monthlyIncome }),
      years,
    };
  }
  const sel = plan && plan.kind !== "house" ? analyzeSavings(plan) : null;

  // One combined net-worth path reflecting ALL plans.
  const chart = useMemo(() => {
    if (!plans.length) return null;
    const retirementPlan = plans.find((p) => p.kind === "retirement");
    const investReturn = plans.find((p) => p.kind !== "house")?.return_rate ?? 7;
    const houses = plans
      .filter((p) => p.kind === "house" && p.target_year > currentYear)
      .map((p) => ({
        year: p.target_year,
        price: p.target_amount,
        downPayment: p.down_payment,
        loanRate: p.loan_rate ?? 5.5,
        loanTerm: p.loan_term ?? 25,
        appreciation: p.return_rate ?? 3,
        name: p.name,
      }));
    const xMax = Math.max(lifeYear, currentYear + 1, ...plans.map((p) => p.target_year || 0));
    const { series } = simulateNetWorth({
      startNetWorth: netWorth,
      surplus,
      investReturn,
      currentYear,
      lifeYear: xMax,
      retirementYear: retirementPlan ? retirementPlan.target_year : null,
      retirementSpending: retireSpending,
      currentHousing,
      houses,
    });
    const data = series.map((p) => ({ year: p.year, NetWorth: p.value }));
    const valueAt = (yr) => {
      let v = data[0] ? data[0].NetWorth : 0;
      for (const p of data) {
        if (p.year <= yr) v = p.NetWorth;
        else break;
      }
      return v;
    };
    const crossing = (target) => {
      for (const p of data) if (p.NetWorth >= target) return p.year;
      return null;
    };
    const markers = plans.map((p) => {
      const deadline = p.target_year || currentYear;
      if (p.kind === "house") {
        return { id: p.id, name: p.name, x: deadline, y: valueAt(deadline), color: "var(--accent)", status: `buy ${fmt(p.target_amount)} home in ${deadline}` };
      }
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
    const ro = runsOutYear(series);
    const lineColor = ro ? "var(--red)" : "var(--green)";
    return { data, markers, xMax, ro, lineColor, latest: data[data.length - 1]?.NetWorth || 0 };
  }, [plans, netWorth, surplus, currentYear, lifeYear, retireSpending, currentHousing]);

  const houseInfo = useMemo(() => {
    if (!plan || plan.kind !== "house") return null;
    const price = plan.target_amount || 0;
    const down = plan.down_payment != null ? plan.down_payment : price * 0.2;
    const pay = mortgagePayment(Math.max(0, price - down), plan.loan_rate ?? 5.5, plan.loan_term ?? 25);
    return { down, pay, delta: pay - currentHousing };
  }, [plan, currentHousing]);

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

  const monthlyPlan = sel ? (sel.status === "on-track" || sel.status === "reached" ? surplus : sel.required) : 0;
  const isHouse = plan && plan.kind === "house";

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
          <p className="muted">No plans yet — add one to project how a goal shapes your net worth over your life.</p>
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
                <label className="field"><span>{isHouse ? "Home price" : "Target amount"}</span><input type="number" defaultValue={plan.target_amount} key={`t${plan.id}`} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                <label className="field"><span>{isHouse ? "Purchase year" : "Target year"}</span><input type="number" defaultValue={plan.target_year || ""} key={`y${plan.id}`} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                {isHouse ? (
                  <>
                    <label className="field"><span>Down payment</span><input type="number" defaultValue={plan.down_payment ?? ""} placeholder={`20% (${fmt((plan.target_amount || 0) * 0.2)})`} key={`d${plan.id}`} onBlur={(e) => patch("down_payment", e.target.value)} /></label>
                    <label className="field"><span>Mortgage rate %</span><input type="number" step="0.1" defaultValue={plan.loan_rate ?? ""} placeholder="5.5" key={`lr${plan.id}`} onBlur={(e) => patch("loan_rate", e.target.value)} /></label>
                    <label className="field"><span>Mortgage term (yrs)</span><input type="number" defaultValue={plan.loan_term ?? ""} placeholder="25" key={`lt${plan.id}`} onBlur={(e) => patch("loan_term", e.target.value)} /></label>
                    <label className="field"><span>Appreciation % / yr</span><input type="number" step="0.1" defaultValue={plan.return_rate} key={`r${plan.id}`} onBlur={(e) => patch("return_rate", e.target.value)} /></label>
                  </>
                ) : (
                  <label className="field"><span>Investment return % / yr</span><input type="number" step="0.1" defaultValue={plan.return_rate} key={`r${plan.id}`} onBlur={(e) => patch("return_rate", e.target.value)} /></label>
                )}
                <div className="field plan-delete"><span>&nbsp;</span><button className="btn ghost sm" onClick={remove}>Delete plan</button></div>
              </div>
              <div className="plan-grid about-you">
                <label className="field"><span>Your age</span><input type="number" defaultValue={settings.fs_age ?? ""} placeholder="30" key={`age${plan.id}`} onBlur={(e) => saveSetting("fs_age", e.target.value)} /></label>
                <label className="field"><span>Life expectancy (age)</span><input type="number" defaultValue={settings.fs_life ?? ""} placeholder="90" key={`life${plan.id}`} onBlur={(e) => saveSetting("fs_life", e.target.value)} /></label>
                <label className="field"><span>Retirement spending / mo</span><input type="number" defaultValue={settings.fs_spend ?? ""} placeholder={fmt(retireSpending)} key={`sp${plan.id}`} onBlur={(e) => saveSetting("fs_spend", e.target.value)} /></label>
                <label className="field"><span>Current rent/mortgage / mo</span><input type="number" defaultValue={settings.fs_housing ?? ""} placeholder="0" key={`ho${plan.id}`} onBlur={(e) => saveSetting("fs_housing", e.target.value)} /></label>
              </div>
            </section>
          )}

          {chart && (
            <section className="card chart-card">
              <div className="widget-head">
                <div>
                  <span className="muted">Net worth with all plans</span>
                  <div className="widget-value">{fmt(chart.latest)}<span className="muted unit"> by {chart.xMax}</span></div>
                </div>
              </div>
              {chart.data.length <= 1 ? (
                <p className="muted empty">Set a future target year and your age to see the projection.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chart.data} margin={{ top: 16, right: 20, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" type="number" domain={[currentYear, chart.xMax]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                    <Tooltip formatter={(v) => fmtc(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} />
                    <Line type="monotone" dataKey="NetWorth" stroke={chart.lineColor} strokeWidth={2.5} dot={false} />
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
          )}

          {isHouse && houseInfo && (
            <section className="card contrib-card">
              <span className="muted">{plan.name} — what it costs</span>
              <div className="contrib-amount">{fmt(houseInfo.pay)}<span className="muted unit"> / month mortgage</span></div>
              <p className="muted">
                Down payment {fmtc(houseInfo.down)} up front, then ~{fmtc(houseInfo.pay)}/mo on the mortgage.
                {currentHousing > 0
                  ? ` That ${houseInfo.delta >= 0 ? "is " + fmtc(houseInfo.delta) + " more" : "frees up " + fmtc(-houseInfo.delta)} than your current ${fmtc(currentHousing)}/mo housing, changing how much you can save.`
                  : " Set your current rent/mortgage in Edit plan so this shows the change to your monthly savings."}
                {" "}The home is treated as debt that pays down over time and appreciates at {plan.return_rate}%/yr — not as an investment return.
              </p>
            </section>
          )}

          {!isHouse && sel && sel.status !== "reached" && sel.years > 0 && (
            <section className="card contrib-card">
              <span className="muted">To stay on the projected path</span>
              <div className="contrib-amount">{fmt(monthlyPlan)}<span className="muted unit"> / month</span></div>
              <p className="muted">
                Set aside about {fmtc(monthlyPlan)} each month toward <strong>{plan.name}</strong>
                {sel.status === "behind" ? ` (up from your current ${fmtc(surplus)})` : ""} — invested at {plan.return_rate}% in an investment account.
                {sel.status === "impossible" ? " Note: this is more than your current income, so this goal isn't reachable as set." : ""}
              </p>
            </section>
          )}

          {!isHouse && (
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
          )}
        </>
      )}
    </div>
  );
}
