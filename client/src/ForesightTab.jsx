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
import { analyzePlan, simulateNetWorth, mortgagePayment, compoundedSaving, afterTaxIncome, toTodaysDollars } from "./foresight.js";

const INFLATION = 0.025; // annual rate used to show projections in today's dollars

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtc = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

const KINDS = [
  { key: "retirement", label: "Retirement" },
  { key: "house", label: "House purchase" },
  { key: "job", label: "New job / income change" },
  { key: "education", label: "Education" },
  { key: "kids", label: "Having kids" },
  { key: "income", label: "Income (other)" },
  { key: "expense", label: "Expense (other)" },
  { key: "pension", label: "Pension" },
  { key: "custom", label: "Custom goal" },
];
const PENSION_TYPES = ["CPP", "QPP", "OAS", "GIS", "Workplace pension", "RRSP/RRIF", "Other"];
const KIDS_DEFAULT = 13000; // ~ annual cost of raising a child in Canada (editable)
const EVENT_KINDS = ["job", "education", "kids", "income", "expense", "pension"];

function parseConfig(p) {
  try {
    return p && p.config ? (typeof p.config === "string" ? JSON.parse(p.config) : p.config) : {};
  } catch {
    return {};
  }
}

export default function ForesightTab({ txns = [] }) {
  const [plans, setPlans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState({});
  const [budgets, setBudgets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newKind, setNewKind] = useState("retirement");
  const [newName, setNewName] = useState("");
  const currentYear = new Date().getFullYear();

  async function load() {
    try {
      const [p, a, s, b] = await Promise.all([api.listPlans(), api.listAccounts(), api.getSettings(), api.listBudgets()]);
      setPlans(p);
      setAccounts(a);
      setSettings(s);
      setBudgets(b);
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
  const { monthlyIncomeTxn, monthlyExpenseTxn } = useMemo(() => {
    const months = new Set();
    let inc = 0;
    let exp = 0;
    for (const t of txns) {
      months.add(String(t.date).slice(0, 7));
      if (t.type === "income") inc += Number(t.amount || 0);
      else exp += Number(t.amount || 0);
    }
    const n = Math.max(1, months.size);
    return { monthlyIncomeTxn: inc / n, monthlyExpenseTxn: exp / n };
  }, [txns]);

  // The user's Budget tab is the source of truth for monthly income and spending.
  // Sum the income-type and expense-type categories separately; fall back to
  // observed transactions when a side of the budget hasn't been set.
  const budgetedIncome = useMemo(
    () => budgets.filter((b) => b.type === "income").reduce((s, b) => s + Number(b.amount || 0), 0),
    [budgets]
  );
  const budgetedExpense = useMemo(
    () => budgets.filter((b) => b.type !== "income").reduce((s, b) => s + Number(b.amount || 0), 0),
    [budgets]
  );
  const monthlyIncome = budgetedIncome > 0 ? budgetedIncome : monthlyIncomeTxn;
  const plannedExpense = budgetedExpense > 0 ? budgetedExpense : monthlyExpenseTxn;
  // Monthly amount available to invest = income minus planned spending.
  const surplus = Math.max(0, monthlyIncome - plannedExpense);

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
    settings.fs_spend != null && settings.fs_spend !== "" ? Number(settings.fs_spend) : Math.round(plannedExpense) || 4000;
  const currentHousing = settings.fs_housing != null && settings.fs_housing !== "" ? Number(settings.fs_housing) : 0;
  const lifeYear = currentYear + Math.max(1, lifeExp - age);

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;
  const cfg = parseConfig(plan);
  const retirementYear = plans.find((p) => p.kind === "retirement")?.target_year || null;

  function analyzeSavings(p) {
    const years = (p.target_year || currentYear) - currentYear;
    return {
      ...analyzePlan({ start: netWorth, target: p.target_amount, rate: p.return_rate, years, contribution: surplus, monthlyIncome }),
      years,
    };
  }
  const sel = plan && (plan.kind === "retirement" || plan.kind === "custom") ? analyzeSavings(plan) : null;

  const chart = useMemo(() => {
    if (!plans.length) return null;
    const investReturn = plans.find((p) => p.kind === "retirement" || p.kind === "custom")?.return_rate ?? 7;
    const houses = [];
    const flows = [];
    const lumps = [];
    for (const p of plans) {
      const c = parseConfig(p);
      const startY = p.target_year || currentYear;
      const endY = Number(c.end_year) || startY;
      const amt = Number(p.target_amount) || 0;
      switch (p.kind) {
        case "house":
          if (startY > currentYear)
            houses.push({ year: startY, price: amt, downPayment: p.down_payment, loanRate: p.loan_rate ?? 5.5, loanTerm: p.loan_term ?? 25, appreciation: p.return_rate ?? 3, name: p.name });
          break;
        case "job": {
          // A job is your primary income. The entered salary is gross, so we
          // estimate take-home after income tax, then what you invest is take-home
          // minus planned monthly spending (from the Budget tab) — not the whole
          // paycheck. Subtracting `surplus` cancels the base saving the sim already
          // applies, so the net monthly saving lands at takeHome/12 − plannedExpense.
          const takeHome = afterTaxIncome(amt);
          flows.push({ start: startY, end: retirementYear || lifeYear, monthly: takeHome / 12 - plannedExpense - surplus });
          break;
        }
        case "education": {
          const schoolInc = c.school_income != null && c.school_income !== "" ? Number(c.school_income) : monthlyIncome * 12;
          flows.push({ start: startY, end: endY, monthly: schoolInc / 12 - monthlyIncome - amt / 12 });
          break;
        }
        case "kids":
          flows.push({ start: startY, end: endY, monthly: -(amt / 12) });
          break;
        case "income":
          if (c.one_time) lumps.push({ year: startY, amount: amt });
          else flows.push({ start: startY, end: endY, monthly: amt / 12 });
          break;
        case "expense":
          if (c.one_time) lumps.push({ year: startY, amount: -amt });
          else flows.push({ start: startY, end: endY, monthly: -(amt / 12) });
          break;
        case "pension":
          flows.push({ start: startY, end: lifeYear, monthly: amt / 12 });
          break;
        default:
          break;
      }
    }
    const xMax = Math.max(lifeYear, currentYear + 1, ...plans.map((p) => p.target_year || 0));
    const { series } = simulateNetWorth({
      startNetWorth: netWorth,
      surplus,
      investReturn,
      currentYear,
      lifeYear: xMax,
      retirementYear,
      retirementSpending: retireSpending,
      currentHousing,
      houses,
      flows,
      lumps,
    });
    // Discount each year to today's dollars so the projection reflects real
    // purchasing power instead of inflated future figures. Targets the user
    // enters (retirement amount, home price) are in today's dollars, so the
    // markers and crossings below compare consistently.
    const data = series.map((p) => ({ year: p.year, NetWorth: toTodaysDollars(p.value, p.year - currentYear, INFLATION) }));
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
      const c = parseConfig(p);
      const startY = p.target_year || currentYear;
      const endY = Number(c.end_year) || startY;
      const amt = Number(p.target_amount) || 0;
      if (p.kind === "retirement" || p.kind === "custom") {
        const deadline = startY;
        const cross = crossing(amt);
        if (cross != null && cross <= deadline) return { id: p.id, name: p.name, x: cross, y: amt, color: "var(--green)", status: `on track — reaches ${fmt(amt)} in ${cross}` };
        const v = valueAt(deadline);
        if (cross != null) return { id: p.id, name: p.name, x: deadline, y: v, color: "#fbbf24", status: `reaches ${fmt(amt)} in ${cross}, after your ${deadline} target` };
        return { id: p.id, name: p.name, x: deadline, y: v, color: "var(--red)", status: `${fmt(Math.max(0, amt - v))} short by ${deadline}` };
      }
      let status;
      if (p.kind === "house") status = `buy ${fmt(amt)} home in ${startY}`;
      else if (p.kind === "job") status = `new job ${fmt(amt)}/yr from ${startY}`;
      else if (p.kind === "education") status = `school ${startY}–${endY}, ${fmt(amt)}/yr tuition`;
      else if (p.kind === "kids") status = `child ${startY}–${endY}, ${fmt(amt)}/yr`;
      else if (p.kind === "income") status = c.one_time ? `income ${fmt(amt)} in ${startY}` : `income ${fmt(amt)}/yr ${startY}–${endY}`;
      else if (p.kind === "expense") status = c.one_time ? `expense ${fmt(amt)} in ${startY}` : `expense ${fmt(amt)}/yr ${startY}–${endY}`;
      else if (p.kind === "pension") status = `${c.pension_type || "Pension"} ${fmt(amt)}/yr from ${startY}`;
      else status = "";
      return { id: p.id, name: p.name, x: startY, y: valueAt(startY), color: "var(--accent)", status };
    });
    // "Running out of money" only means depleting savings in retirement — so only
    // flag a negative balance in a year AFTER the retirement year. A negative
    // balance today (current debt) or before retirement isn't "running out".
    const ro = retirementYear ? (series.find((p) => p.year > retirementYear && p.value < 0)?.year ?? null) : null;
    // Colour the line by value: green where net worth is >= 0, red only where it
    // dips below zero. Implemented as a vertical gradient split at the zero line.
    const vals = data.map((d) => d.NetWorth);
    const dataMax = Math.max(...vals, 0);
    const dataMin = Math.min(...vals, 0);
    const gradientOffset = dataMax <= 0 ? 0 : dataMin >= 0 ? 1 : dataMax / (dataMax - dataMin);
    return { data, markers, xMax, ro, gradientOffset, latest: data[data.length - 1]?.NetWorth || 0 };
  }, [plans, netWorth, surplus, plannedExpense, currentYear, lifeYear, retireSpending, currentHousing, retirementYear, monthlyIncome]);

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
      .map((c) => ({ cat: c.cat, monthly: c.monthly, saving: c.monthly * 0.25, grows: compoundedSaving(c.monthly * 0.25, plan.return_rate, sel.years) }));
  }, [catMonthly, sel, plan]);

  // Sensible defaults for each plan type — shared by "New plan" and type-switch.
  const planDefaults = (kind) =>
    ({
      retirement: { name: "Retirement", target_amount: 1000000, target_year: currentYear + 30, return_rate: 7, config: {} },
      house: { name: "Home", target_amount: 500000, target_year: currentYear + 5, return_rate: 3, down_payment: null, loan_rate: 5.5, loan_term: 25, config: {} },
      custom: { name: "Goal", target_amount: 50000, target_year: currentYear + 5, return_rate: 7, config: {} },
      job: { name: "New job", target_amount: 80000, target_year: currentYear + 1, return_rate: 0, config: {} },
      education: { name: "Education", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 4, school_income: Math.round(monthlyIncome * 12) } },
      kids: { name: "Child", target_amount: KIDS_DEFAULT, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 19 } },
      income: { name: "Extra income", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 1, one_time: true } },
      expense: { name: "One-off expense", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 1, one_time: true } },
      pension: { name: "Pension", target_amount: 15000, target_year: currentYear + 30, return_rate: 0, config: { pension_type: "CPP" } },
    }[kind] || {});

  function openNew() {
    setNewKind("retirement");
    setNewName("");
    setNewOpen(true);
  }
  async function createPlan() {
    const d = planDefaults(newKind);
    const name = (newName && newName.trim()) || d.name || "Plan";
    const p = await api.addPlan({ kind: newKind, ...d, name });
    setNewOpen(false);
    setSelectedId(p.id);
    load();
  }
  async function patch(field, value) {
    if (!plan) return;
    await api.updatePlan(plan.id, { [field]: value });
    load();
  }
  function patchConfig(key, value) {
    patch("config", { ...cfg, [key]: value });
  }
  // Switching plan type resets to sensible defaults for that type.
  async function changeKind(kind) {
    if (!plan) return;
    await api.updatePlan(plan.id, { kind, ...planDefaults(kind) });
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
  function openEdit(id) {
    setSelectedId(id);
    setEditing(true);
  }
  function closeEdit() {
    setEditing(false);
  }

  const monthlyPlan = sel ? (sel.status === "on-track" || sel.status === "reached" ? surplus : sel.required) : 0;
  const k = plan ? plan.kind : null;
  const fk = (s) => `${s}${plan?.id}${k}`; // input key that refreshes on plan/kind change

  return (
    <div className="foresight-tab">
      <PageActions>
        <button className="btn primary sm" onClick={openNew}>+ New plan</button>
      </PageActions>

      {newOpen && (
        <div className="modal-overlay" onClick={() => setNewOpen(false)}>
          <section className="card plan-modal new-plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">New plan</span>
              <button className="modal-close" onClick={() => setNewOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="plan-grid">
              <label className="field"><span>Type</span><select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{KINDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
              <label className="field"><span>Name</span><input value={newName} placeholder={planDefaults(newKind).name || ""} onChange={(e) => setNewName(e.target.value)} /></label>
            </div>
            <p className="muted new-plan-hint">A plan is created with sensible defaults — click its dot or name on the graph to fine-tune the amounts.</p>
            <div className="plan-modal-footer">
              <button className="btn ghost sm" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn primary sm" onClick={createPlan}>Create plan</button>
            </div>
          </section>
        </div>
      )}

      {plans.length === 0 ? (
        <section className="card">
          <p className="muted">No plans yet — add one to project how a goal or life event shapes your net worth.</p>
        </section>
      ) : (
        <>
          {editing && plan && (
            <div className="modal-overlay" onClick={closeEdit}>
            <section className="card plan-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <span className="modal-title">Edit plan</span>
                <button className="modal-close" onClick={closeEdit} aria-label="Close">×</button>
              </div>
              <div className="plan-grid">
                <label className="field"><span>Name</span><input defaultValue={plan.name} key={fk("n")} onBlur={(e) => patch("name", e.target.value)} /></label>
                <label className="field"><span>Type</span><select value={plan.kind} onChange={(e) => changeKind(e.target.value)}>{KINDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>

                {(k === "retirement" || k === "custom") && (
                  <>
                    <label className="field"><span>Target amount</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>Target year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    <label className="field"><span>Investment return % / yr</span><input type="number" step="0.1" defaultValue={plan.return_rate} key={fk("r")} onBlur={(e) => patch("return_rate", e.target.value)} /></label>
                  </>
                )}
                {k === "retirement" && (
                  <label className="field"><span>Retirement spending / mo</span><input type="number" defaultValue={settings.fs_spend ?? ""} placeholder={fmt(retireSpending)} key={fk("sp")} onBlur={(e) => saveSetting("fs_spend", e.target.value)} /></label>
                )}
                {k === "house" && (
                  <>
                    <label className="field"><span>Home price</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>Purchase year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    <label className="field"><span>Down payment</span><input type="number" defaultValue={plan.down_payment ?? ""} placeholder={`20% (${fmt((plan.target_amount || 0) * 0.2)})`} key={fk("d")} onBlur={(e) => patch("down_payment", e.target.value)} /></label>
                    <label className="field"><span>Mortgage rate %</span><input type="number" step="0.1" defaultValue={plan.loan_rate ?? ""} placeholder="5.5" key={fk("lr")} onBlur={(e) => patch("loan_rate", e.target.value)} /></label>
                    <label className="field"><span>Mortgage term (yrs)</span><input type="number" defaultValue={plan.loan_term ?? ""} placeholder="25" key={fk("lt")} onBlur={(e) => patch("loan_term", e.target.value)} /></label>
                    <label className="field"><span>Appreciation % / yr</span><input type="number" step="0.1" defaultValue={plan.return_rate} key={fk("r")} onBlur={(e) => patch("return_rate", e.target.value)} /></label>
                  </>
                )}
                {k === "job" && (
                  <>
                    <label className="field"><span>New income / yr</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>Start year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    <div className="field"><span>Now</span><span className="muted nowval">{fmt(monthlyIncome * 12)}/yr current income</span></div>
                  </>
                )}
                {k === "education" && (
                  <>
                    <label className="field"><span>Start year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    <label className="field"><span>End year</span><input type="number" defaultValue={cfg.end_year ?? ""} key={fk("e")} onBlur={(e) => patchConfig("end_year", e.target.value)} /></label>
                    <label className="field"><span>Tuition / yr</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>Income while studying / yr</span><input type="number" defaultValue={cfg.school_income ?? ""} placeholder={`Same (${fmt(monthlyIncome * 12)})`} key={fk("si")} onBlur={(e) => patchConfig("school_income", e.target.value)} /></label>
                  </>
                )}
                {k === "kids" && (
                  <>
                    <label className="field"><span>Start year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    <label className="field"><span>Support until year</span><input type="number" defaultValue={cfg.end_year ?? ""} key={fk("e")} onBlur={(e) => patchConfig("end_year", e.target.value)} /></label>
                    <label className="field"><span>Cost / yr (CA est.)</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                  </>
                )}
                {(k === "income" || k === "expense") && (
                  <>
                    <label className="field"><span>{cfg.one_time ? "Amount" : "Amount / yr"}</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>{cfg.one_time ? "Year" : "Start year"}</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                    {!cfg.one_time && <label className="field"><span>End year</span><input type="number" defaultValue={cfg.end_year ?? ""} key={fk("e")} onBlur={(e) => patchConfig("end_year", e.target.value)} /></label>}
                    <label className="field checkbox-field"><span>One-time</span><input type="checkbox" checked={!!cfg.one_time} onChange={(e) => patchConfig("one_time", e.target.checked)} /></label>
                  </>
                )}
                {k === "pension" && (
                  <>
                    <label className="field"><span>Pension type</span><select value={cfg.pension_type || "CPP"} onChange={(e) => patchConfig("pension_type", e.target.value)}>{PENSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label className="field"><span>Income / yr</span><input type="number" defaultValue={plan.target_amount} key={fk("t")} onBlur={(e) => patch("target_amount", e.target.value)} /></label>
                    <label className="field"><span>Starts in year</span><input type="number" defaultValue={plan.target_year || ""} key={fk("y")} onBlur={(e) => patch("target_year", e.target.value)} /></label>
                  </>
                )}

              </div>
              <div className="plan-modal-footer">
                <button className="btn danger sm" onClick={remove}>Delete plan</button>
              </div>
            </section>
            </div>
          )}

          {chart && (
            <section className="card chart-card">
              <div className="widget-head">
                <div>
                  <span className="muted">Net worth with all plans · today's dollars</span>
                  <div className="widget-value">{fmt(chart.latest)}<span className="muted unit"> by {chart.xMax}</span></div>
                </div>
              </div>
              {chart.data.length <= 1 ? (
                <p className="muted empty">Set a future year and your age to see the projection.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chart.data} margin={{ top: 16, right: 20, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={chart.gradientOffset} stopColor="var(--green)" />
                        <stop offset={chart.gradientOffset} stopColor="var(--red)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" type="number" domain={[currentYear, chart.xMax]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                    <Tooltip formatter={(v) => fmtc(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} />
                    <Line type="monotone" dataKey="NetWorth" stroke="url(#nwGradient)" strokeWidth={2.5} dot={false} />
                    {chart.markers.map((m) => (
                      <ReferenceDot key={m.id} x={m.x} y={m.y} r={6} fill={m.color} stroke="var(--card)" strokeWidth={2} ifOverflow="extendDomain" onClick={() => openEdit(m.id)} style={{ cursor: "pointer" }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
              <ul className="foresight-legend">
                {chart.markers.map((m) => (
                  <li key={m.id} className="legend-clickable" onClick={() => openEdit(m.id)} title="Edit plan"><span className="legend-dot" style={{ background: m.color }} /><strong>{m.name}</strong><span className="muted"> — {m.status}</span></li>
                ))}
                {chart.ro && (
                  <li><span className="legend-dot" style={{ background: "var(--red)" }} /><span className="neg">Savings run out in {chart.ro}</span><span className="muted"> — after retirement, spending draws the balance below zero.</span></li>
                )}
              </ul>
            </section>
          )}

          {chart && chart.data.length > 1 && (
            <section className="card">
              <span className="muted">Year-by-year</span>
              <div className="year-table-wrap">
                <table className="year-table">
                  <thead>
                    <tr><th>Year</th><th className="right">Net worth</th><th className="right">Change</th>{retirementYear && <th>Phase</th>}</tr>
                  </thead>
                  <tbody>
                    {chart.data.map((p, i) => {
                      const prev = i > 0 ? chart.data[i - 1].NetWorth : null;
                      const change = prev != null ? p.NetWorth - prev : 0;
                      return (
                        <tr key={p.year}>
                          <td>{p.year}</td>
                          <td className={`right ${p.NetWorth < 0 ? "neg" : ""}`}>{fmtc(p.NetWorth)}</td>
                          <td className={`right ${change >= 0 ? "pos" : "neg"}`}>{prev != null ? `${change >= 0 ? "+" : ""}${fmtc(change)}` : "—"}</td>
                          {retirementYear && <td className="muted">{p.year > retirementYear ? "Retired" : "Saving"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {k === "house" && houseInfo && (
            <section className="card contrib-card">
              <span className="muted">{plan.name} — what it costs</span>
              <div className="contrib-amount">{fmt(houseInfo.pay)}<span className="muted unit"> / month mortgage</span></div>
              <p className="muted">
                Down payment {fmtc(houseInfo.down)} up front, then ~{fmtc(houseInfo.pay)}/mo.
                {currentHousing > 0
                  ? ` That ${houseInfo.delta >= 0 ? "is " + fmtc(houseInfo.delta) + " more" : "frees up " + fmtc(-houseInfo.delta)} than your current ${fmtc(currentHousing)}/mo housing.`
                  : " Set your current rent/mortgage in Edit plan to see the change to your savings."}
                {" "}The home is treated as debt that pays down and appreciates {plan.return_rate}%/yr — not as an investment return.
              </p>
            </section>
          )}

          {sel && sel.status !== "reached" && sel.years > 0 && (
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

          {sel && (
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
