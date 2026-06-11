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
import { simulateNetWorth, mortgagePayment, afterTaxIncome, toTodaysDollars } from "./foresight.js";

const INFLATION = 0.025; // annual rate used to show projections in today's dollars

// Small emoji icon per plan type, used in the legend.
const PLAN_ICONS = {
  retirement: "🏖️",
  house: "🏠",
  job: "💼",
  education: "🎓",
  kids: "👶",
  income: "💵",
  expense: "💸",
  pension: "🏦",
};
const planIcon = (kind) => PLAN_ICONS[kind] || "📍";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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

// How much of a job's income increase gets invested, from a slider position.
//   pos 0  (left)   = Same — keep investing what you do today (0 of the raise)
//   pos 0.5 (middle)= Proportional — keep your current savings rate on the raise
//   pos 1  (right)  = All — invest the entire raise
// In between is custom; the value is capped at `delta` (the raise itself).
// `delta` is the monthly take-home increase; `savingsRate` is current savings/income.
function investedExtra(pos, delta, savingsRate) {
  if (!(delta > 0)) return delta; // a pay cut (or no raise) flows through in full
  const p = Math.min(1, Math.max(0, Number(pos) ?? 0.5));
  const r = Math.min(1, Math.max(0, Number(savingsRate) || 0));
  const prop = r * delta; // the "proportional" amount, anchored at the middle
  if (p <= 0.5) return (p / 0.5) * prop;
  return prop + ((p - 0.5) / 0.5) * (delta - prop);
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
  const [sliderPos, setSliderPos] = useState(0.5); // job raise-allocation slider
  const [drag, setDrag] = useState(null); // { id, year, moved } while dragging a marker
  const [menuOpen, setMenuOpen] = useState(false); // new-plan type dropdown
  const [draft, setDraft] = useState(null); // in-progress new plan being created
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

  // Close the new-plan dropdown when clicking outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (!e.target.closest || !e.target.closest(".new-plan-dd")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

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

  // Budget-tab categories, split by side, used by the projected-budget table.
  const incomeCats = useMemo(() => budgets.filter((b) => b.type === "income"), [budgets]);
  const expenseCats = useMemo(() => budgets.filter((b) => b.type !== "income"), [budgets]);
  // Manual per-year tweaks to a category, stored as carry-forward change points:
  // [{ cat, year, amt }] (annual $). The effective value at year y is the latest
  // change point with year <= y, else the base annual budget.
  const overrides = useMemo(() => {
    try {
      return settings.fs_budget_overrides ? JSON.parse(settings.fs_budget_overrides) : [];
    } catch {
      return [];
    }
  }, [settings.fs_budget_overrides]);
  function effBase(cat, baseAnnual, y) {
    let v = baseAnnual;
    let best = -Infinity;
    for (const o of overrides) if (o.cat === cat && o.year <= y && o.year > best) { best = o.year; v = o.amt; }
    return v;
  }
  async function setOverride(cat, year, amount) {
    const next = overrides.filter((o) => !(o.cat === cat && o.year === year));
    next.push({ cat, year, amt: Math.max(0, Math.round(Number(amount) || 0)) });
    await saveSetting("fs_budget_overrides", JSON.stringify(next));
  }

  const age = Number(settings.fs_age) || 30;
  const lifeExp = Number(settings.fs_life) || 90;
  const retireSpending =
    settings.fs_spend != null && settings.fs_spend !== "" ? Number(settings.fs_spend) : Math.round(plannedExpense) || 4000;
  const currentHousing = settings.fs_housing != null && settings.fs_housing !== "" ? Number(settings.fs_housing) : 0;
  const lifeYear = currentYear + Math.max(1, lifeExp - age);

  const plan = plans.find((p) => p.id === selectedId) || plans[0] || null;
  const cfg = parseConfig(plan);

  // While a marker is being dragged, override that plan's year so the whole
  // projection (line + markers) recomputes live; the real data is only written
  // back on release.
  const effectivePlans = useMemo(
    () => (drag ? plans.map((p) => (p.id === drag.id ? { ...p, target_year: drag.year } : p)) : plans),
    [plans, drag]
  );
  const retirementYear = effectivePlans.find((p) => p.kind === "retirement")?.target_year || null;

  // Keep the job raise-allocation slider in sync with the plan being edited.
  useEffect(() => {
    if (editing && plan && plan.kind === "job") {
      setSliderPos(Number(parseConfig(plan).invest_pos ?? 0.5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedId, plan?.kind]);


  const chart = useMemo(() => {
    if (!effectivePlans.length) return null;
    const investReturn = effectivePlans.find((p) => p.kind === "retirement")?.return_rate ?? 7;
    const houses = [];
    const flows = [];
    const lumps = [];
    for (const p of effectivePlans) {
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
          // A job is your primary income. The entered salary is gross, so estimate
          // monthly take-home after tax. The raise over your current income is
          // `delta`; how much of it you invest is set by the plan's slider (Same /
          // Proportional / All / custom). The sim already adds your base saving
          // (`surplus`), so the job flow only adds the invested portion of the raise.
          const delta = afterTaxIncome(amt) / 12 - monthlyIncome;
          const savingsRate = monthlyIncome > 0 ? surplus / monthlyIncome : 1;
          const extra = investedExtra(c.invest_pos ?? 0.5, delta, savingsRate);
          flows.push({ start: startY, end: retirementYear || lifeYear, monthly: extra });
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
    const xMax = Math.max(lifeYear, currentYear + 1, ...effectivePlans.map((p) => p.target_year || 0));
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
    const markers = effectivePlans.map((p) => {
      const c = parseConfig(p);
      const startY = p.target_year || currentYear;
      const endY = Number(c.end_year) || startY;
      const amt = Number(p.target_amount) || 0;
      if (p.kind === "retirement") {
        // "What if I stop working in this year": mark the retirement year with the
        // net worth you'd have, then whether the drawdown lasts through life. The
        // run-out year (if any) is stated by the dedicated warning line below.
        const ry = startY;
        const v = valueAt(ry);
        const lasts = !data.some((d) => d.year > ry && d.NetWorth < 0);
        const status = `retire ${ry} with ${fmt(v)} saved, then ${fmt(retireSpending)}/mo` + (lasts ? ` — lasts through ${lifeYear}` : "");
        return { id: p.id, name: p.name, kind: p.kind, x: ry, y: v, color: lasts ? "var(--green)" : "var(--red)", status };
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
      return { id: p.id, name: p.name, kind: p.kind, x: startY, y: valueAt(startY), color: "var(--accent)", status };
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
  }, [effectivePlans, netWorth, surplus, plannedExpense, currentYear, lifeYear, retireSpending, currentHousing, retirementYear, monthlyIncome]);

  // Projected ANNUAL budget table. Plans map onto rows automatically:
  //  • a Job change drives your salary income row (take-home, locked from its year)
  //  • a House drives your housing expense row (mortgage, locked from purchase)
  //  • Retirement zeroes only the salary row (other income & pensions continue)
  //  • Pensions, other income/expense and education get their own locked rows
  //  • a Child's cost is spread across grocery/health/insurance/etc. rows
  // Everything else stays editable; tweaks carry forward.
  const budgetTable = useMemo(() => {
    if (!incomeCats.length && !expenseCats.length) return null;
    const xMaxLocal = Math.max(lifeYear, currentYear + 1, ...plans.map((p) => p.target_year || 0));
    const years = [];
    for (let y = currentYear; y <= xMaxLocal; y++) years.push(y);
    const retireY = retirementYear;

    const job = plans.find((p) => p.kind === "job") || null;
    const house = plans.find((p) => p.kind === "house" && (p.target_year || currentYear) > currentYear) || null;
    const salaryCat = incomeCats.find((b) => /salar|wage|\bjob\b|employ|paycheck/i.test(b.category))?.category || incomeCats[0]?.category || null;
    const housingCat = expenseCats.find((b) => /hous|rent|mortgag/i.test(b.category))?.category || null;

    const houseAnnual = (y) => {
      if (!house) return null;
      const sY = house.target_year || currentYear;
      if (y < sY) return null;
      const price = Number(house.target_amount) || 0;
      const down = house.down_payment != null && house.down_payment !== "" ? Number(house.down_payment) : price * 0.2;
      const term = house.loan_term ?? 25;
      return y < sY + term ? Math.round(mortgagePayment(Math.max(0, price - down), house.loan_rate ?? 5.5, term) * 12) : 0;
    };
    const jobAnnual = (y) => {
      if (!job) return null;
      const sY = job.target_year || currentYear;
      return y < sY ? null : Math.round(afterTaxIncome(Number(job.target_amount) || 0));
    };

    // Spread each child's annual cost across matching expense categories; whatever
    // can't be matched falls into a "Children" row.
    const KID_W = { groceries: 3, food: 3, health: 1.5, education: 2, insurance: 1, clothing: 1, shopping: 1 };
    const kidPlans = plans.filter((p) => p.kind === "kids");
    const kidByYear = {};
    for (const y of years) {
      const byCat = {};
      let leftover = 0;
      for (const p of kidPlans) {
        const c = parseConfig(p);
        const sY = p.target_year || currentYear;
        const eY = Number(c.end_year) || sY;
        if (y < sY || y > eY) continue;
        const cost = Number(p.target_amount) || 0;
        const matched = expenseCats.map((b) => ({ cat: b.category, w: KID_W[b.category.toLowerCase()] || 0 })).filter((x) => x.w > 0);
        const totalW = matched.reduce((s, x) => s + x.w, 0);
        if (totalW > 0) for (const m of matched) byCat[m.cat] = (byCat[m.cat] || 0) + cost * (m.w / totalW);
        else leftover += cost;
      }
      kidByYear[y] = { byCat, leftover };
    }

    // Income rows.
    const incomeRows = incomeCats.map((b) => {
      const baseAnnual = Number(b.amount || 0) * 12;
      const cells = years.map((y) => {
        if (b.category === salaryCat) {
          if (retireY && y > retireY) return { year: y, value: 0, locked: true };
          const j = jobAnnual(y);
          if (j != null) return { year: y, value: j, locked: true };
        }
        return { year: y, value: Math.round(effBase(b.category, baseAnnual, y)), locked: false };
      });
      return { category: b.category, cells };
    });
    if (job && !salaryCat) {
      incomeRows.push({ category: "Salary", cells: years.map((y) => (retireY && y > retireY ? { year: y, value: 0, locked: true } : { year: y, value: jobAnnual(y) ?? 0, locked: true })) });
    }
    for (const p of plans.filter((pp) => pp.kind === "pension")) {
      const sY = p.target_year || currentYear;
      const amt = Math.round(Number(p.target_amount) || 0);
      incomeRows.push({ category: p.name || "Pension", cells: years.map((y) => ({ year: y, value: y >= sY ? amt : 0, locked: true })) });
    }
    for (const p of plans.filter((pp) => pp.kind === "income" && !parseConfig(pp).one_time)) {
      const c = parseConfig(p);
      const sY = p.target_year || currentYear;
      const eY = Number(c.end_year) || sY;
      const amt = Math.round(Number(p.target_amount) || 0);
      incomeRows.push({ category: p.name || "Income", cells: years.map((y) => ({ year: y, value: y >= sY && y <= eY ? amt : 0, locked: true })) });
    }

    // Expense rows.
    const expenseRows = expenseCats.map((b) => {
      const baseAnnual = Number(b.amount || 0) * 12;
      const cells = years.map((y) => {
        let value = effBase(b.category, baseAnnual, y);
        let locked = false;
        if (b.category === housingCat) {
          const h = houseAnnual(y);
          if (h != null) { value = h; locked = true; }
        }
        const kidAdd = kidByYear[y].byCat[b.category] || 0;
        if (kidAdd > 0) { value += kidAdd; locked = true; }
        return { year: y, value: Math.round(value), locked };
      });
      return { category: b.category, cells };
    });
    if (house && !housingCat) {
      expenseRows.push({ category: "Housing", cells: years.map((y) => ({ year: y, value: houseAnnual(y) ?? 0, locked: true })) });
    }
    for (const p of plans.filter((pp) => pp.kind === "expense" && !parseConfig(pp).one_time)) {
      const c = parseConfig(p);
      const sY = p.target_year || currentYear;
      const eY = Number(c.end_year) || sY;
      const amt = Math.round(Number(p.target_amount) || 0);
      expenseRows.push({ category: p.name || "Expense", cells: years.map((y) => ({ year: y, value: y >= sY && y <= eY ? amt : 0, locked: true })) });
    }
    for (const p of plans.filter((pp) => pp.kind === "education")) {
      const c = parseConfig(p);
      const sY = p.target_year || currentYear;
      const eY = Number(c.end_year) || sY;
      const amt = Math.round(Number(p.target_amount) || 0);
      expenseRows.push({ category: p.name || "Tuition", cells: years.map((y) => ({ year: y, value: y >= sY && y <= eY ? amt : 0, locked: true })) });
    }
    if (years.some((y) => kidByYear[y].leftover > 0)) {
      expenseRows.push({ category: "Children", cells: years.map((y) => ({ year: y, value: Math.round(kidByYear[y].leftover || 0), locked: true })) });
    }

    const totals = years.map((y, i) => {
      const income = incomeRows.reduce((s, r) => s + r.cells[i].value, 0);
      const expense = expenseRows.reduce((s, r) => s + r.cells[i].value, 0);
      return { year: y, income, expense, net: income - expense };
    });
    return { years, incomeRows, expenseRows, totals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, incomeCats, expenseCats, overrides, currentYear, lifeYear, retirementYear]);


  // Sensible defaults for each plan type — shared by "New plan" and type-switch.
  const planDefaults = (kind) =>
    ({
      retirement: { name: "Retirement", target_amount: 1000000, target_year: currentYear + 30, return_rate: 7, config: {} },
      house: { name: "Home", target_amount: 500000, target_year: currentYear + 5, return_rate: 3, down_payment: null, loan_rate: 5.5, loan_term: 25, config: {} },
      job: { name: "New job", target_amount: 80000, target_year: currentYear + 1, return_rate: 0, config: { invest_pos: 0.5 } },
      education: { name: "Education", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 4, school_income: Math.round(monthlyIncome * 12) } },
      kids: { name: "Child", target_amount: KIDS_DEFAULT, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 19 } },
      income: { name: "Extra income", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 1, one_time: true } },
      expense: { name: "One-off expense", target_amount: 10000, target_year: currentYear + 1, return_rate: 0, config: { end_year: currentYear + 1, one_time: true } },
      pension: { name: "Pension", target_amount: 15000, target_year: currentYear + 30, return_rate: 0, config: { pension_type: "CPP" } },
    }[kind] || {});

  // Open a creation window tailored to the chosen plan type, pre-filled with the
  // type's sensible defaults. The user fills it in, then Create persists it.
  function openCreate(kind) {
    const d = planDefaults(kind);
    setNewKind(kind);
    setDraft({ kind, ...d });
    if (kind === "job") setSliderPos(Number((d.config && d.config.invest_pos) ?? 0.5));
    setMenuOpen(false);
    setNewOpen(true);
  }
  async function createPlan() {
    if (!draft) return;
    const name = (draft.name && String(draft.name).trim()) || planDefaults(newKind).name || "Plan";
    const p = await api.addPlan({ ...draft, kind: newKind, name });
    setNewOpen(false);
    setDraft(null);
    setSelectedId(p.id);
    load();
  }
  // Field setters for the draft (mirror patch / patchConfig but on local state).
  const draftField = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  const draftConfig = (key, value) => setDraft((d) => ({ ...d, config: { ...parseConfig(d), [key]: value } }));
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

  // --- Dragging a marker horizontally to change its plan's year -------------
  function startDrag(id, year) {
    setDrag({ id, year, moved: false });
  }
  function onChartMove(state) {
    if (!drag || !state) return;
    const yr = state.activeLabel;
    if (yr == null) return;
    const clamped = Math.max(currentYear, Math.min(lifeYear, Math.round(Number(yr))));
    setDrag((d) => (d && clamped !== d.year ? { ...d, year: clamped, moved: true } : d));
  }
  async function endDrag() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.moved) {
      await api.updatePlan(d.id, { target_year: d.year }); // persist the new year
      load();
    } else {
      openEdit(d.id); // a click without a drag opens the editor
    }
  }

  const k = plan ? plan.kind : null;
  const fk = (s) => `${s}${plan?.id}${k}`; // input key that refreshes on plan/kind change

  // Type-specific field rows, shared by the edit window (operating on the saved
  // plan) and each tailored creation window (operating on a local draft).
  //   kind      which plan type's fields to render
  //   v         the values object (saved plan or draft)
  //   c         parsed config of v
  //   onField   (field, value) => persist a top-level field
  //   onConfig  (key, value)   => persist a config field
  //   onSlider  (pos)          => persist the job invest slider
  //   kf        (s) => unique input key
  function planFieldRows(kind, v, c, onField, onConfig, onSlider, kf) {
    return (
      <>
        {kind === "retirement" && (
          <>
            <label className="field"><span>Retirement year (stop working)</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            <label className="field"><span>Investment return % / yr</span><input type="number" step="0.1" defaultValue={v.return_rate} key={kf("r")} onBlur={(e) => onField("return_rate", e.target.value)} /></label>
            <label className="field"><span>Retirement spending / mo</span><input type="number" defaultValue={settings.fs_spend ?? ""} placeholder={fmt(retireSpending)} key={kf("sp")} onBlur={(e) => saveSetting("fs_spend", e.target.value)} /></label>
          </>
        )}
        {kind === "house" && (
          <>
            <label className="field"><span>Home price</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
            <label className="field"><span>Purchase year</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            <label className="field"><span>Down payment</span><input type="number" defaultValue={v.down_payment ?? ""} placeholder={`20% (${fmt((v.target_amount || 0) * 0.2)})`} key={kf("d")} onBlur={(e) => onField("down_payment", e.target.value)} /></label>
            <label className="field"><span>Mortgage rate %</span><input type="number" step="0.1" defaultValue={v.loan_rate ?? ""} placeholder="5.5" key={kf("lr")} onBlur={(e) => onField("loan_rate", e.target.value)} /></label>
            <label className="field"><span>Mortgage term (yrs)</span><input type="number" defaultValue={v.loan_term ?? ""} placeholder="25" key={kf("lt")} onBlur={(e) => onField("loan_term", e.target.value)} /></label>
            <label className="field"><span>Appreciation % / yr</span><input type="number" step="0.1" defaultValue={v.return_rate} key={kf("r")} onBlur={(e) => onField("return_rate", e.target.value)} /></label>
          </>
        )}
        {kind === "job" && (
          <>
            <label className="field"><span>New income / yr (gross)</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
            <label className="field"><span>Start year</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            <div className="field"><span>Now</span><span className="muted nowval">{fmt(monthlyIncome * 12)}/yr current income</span></div>
            {(() => {
              const delta = afterTaxIncome(Number(v.target_amount) || 0) / 12 - monthlyIncome;
              const rate = monthlyIncome > 0 ? Math.min(1, Math.max(0, surplus / monthlyIncome)) : 1;
              const extra = investedExtra(sliderPos, delta, rate);
              const persist = (e) => onSlider(Number(e.target.value));
              return (
                <div className="field slider-field">
                  <span>How much of the raise to invest</span>
                  <input
                    type="range" min="0" max="1" step="0.01" value={sliderPos}
                    onChange={(e) => setSliderPos(Number(e.target.value))}
                    onMouseUp={persist} onTouchEnd={persist} onKeyUp={persist}
                  />
                  <div className="slider-labels"><span>Same</span><span>Proportional</span><span>All</span></div>
                  <span className="muted slider-readout">
                    {delta > 0
                      ? `Investing ${fmt(extra * 12)}/yr of your ${fmt(delta * 12)}/yr after-tax raise — the rest goes to spending.`
                      : `This job's take-home is about the same or less than your current income, so there's no raise to allocate.`}
                  </span>
                </div>
              );
            })()}
          </>
        )}
        {kind === "education" && (
          <>
            <label className="field"><span>Start year</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            <label className="field"><span>End year</span><input type="number" defaultValue={c.end_year ?? ""} key={kf("e")} onBlur={(e) => onConfig("end_year", e.target.value)} /></label>
            <label className="field"><span>Tuition / yr</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
            <label className="field"><span>Income while studying / yr</span><input type="number" defaultValue={c.school_income ?? ""} placeholder={`Same (${fmt(monthlyIncome * 12)})`} key={kf("si")} onBlur={(e) => onConfig("school_income", e.target.value)} /></label>
          </>
        )}
        {kind === "kids" && (
          <>
            <label className="field"><span>Start year</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            <label className="field"><span>Support until year</span><input type="number" defaultValue={c.end_year ?? ""} key={kf("e")} onBlur={(e) => onConfig("end_year", e.target.value)} /></label>
            <label className="field"><span>Cost / yr (CA est.)</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
          </>
        )}
        {(kind === "income" || kind === "expense") && (
          <>
            <label className="field"><span>{c.one_time ? "Amount" : "Amount / yr"}</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
            <label className="field"><span>{c.one_time ? "Year" : "Start year"}</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
            {!c.one_time && <label className="field"><span>End year</span><input type="number" defaultValue={c.end_year ?? ""} key={kf("e")} onBlur={(e) => onConfig("end_year", e.target.value)} /></label>}
            <label className="field checkbox-field"><span>One-time</span><input type="checkbox" checked={!!c.one_time} onChange={(e) => onConfig("one_time", e.target.checked)} /></label>
          </>
        )}
        {kind === "pension" && (
          <>
            <label className="field"><span>Pension type</span><select value={c.pension_type || "CPP"} onChange={(e) => onConfig("pension_type", e.target.value)}>{PENSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className="field"><span>Income / yr</span><input type="number" defaultValue={v.target_amount} key={kf("t")} onBlur={(e) => onField("target_amount", e.target.value)} /></label>
            <label className="field"><span>Starts in year</span><input type="number" defaultValue={v.target_year || ""} key={kf("y")} onBlur={(e) => onField("target_year", e.target.value)} /></label>
          </>
        )}
      </>
    );
  }

  return (
    <div className="foresight-tab">
      <PageActions>
        <div className="new-plan-dd">
          <button className="btn primary sm" onClick={() => setMenuOpen((v) => !v)}>+ New plan ▾</button>
          {menuOpen && (
            <div className="new-plan-menu">
              {KINDS.map((x) => (
                <button key={x.key} className="new-plan-menu-item" onClick={() => openCreate(x.key)}>
                  <span className="legend-ico" aria-hidden="true">{planIcon(x.key)}</span>{x.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageActions>

      {newOpen && draft && (
        <div className="modal-overlay" onClick={() => { setNewOpen(false); setDraft(null); }}>
          <section className="card plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">New {KINDS.find((x) => x.key === newKind)?.label || "plan"}</span>
              <button className="modal-close" onClick={() => { setNewOpen(false); setDraft(null); }} aria-label="Close">×</button>
            </div>
            <div className="plan-grid">
              <label className="field"><span>Name</span><input value={draft.name || ""} onChange={(e) => draftField("name", e.target.value)} /></label>
              {planFieldRows(newKind, draft, parseConfig(draft), draftField, draftConfig, (pos) => draftConfig("invest_pos", pos), (s) => `new-${newKind}-${s}`)}
            </div>
            <div className="plan-modal-footer">
              <button className="btn ghost sm" onClick={() => { setNewOpen(false); setDraft(null); }}>Cancel</button>
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

                {planFieldRows(k, plan, cfg, patch, patchConfig, (pos) => patchConfig("invest_pos", pos), fk)}

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
                  <span className="muted drag-hint">Drag a dot left/right to change its year · click it to edit</span>
                </div>
              </div>
              {chart.data.length <= 1 ? (
                <p className="muted empty">Set a future year and your age to see the projection.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chart.data} margin={{ top: 16, right: 20, left: 4, bottom: 0 }} onMouseMove={onChartMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
                    <defs>
                      <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={chart.gradientOffset} stopColor="var(--green)" />
                        <stop offset={chart.gradientOffset} stopColor="var(--red)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" type="number" domain={[currentYear, chart.xMax]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} width={64} fontSize={12} tickFormatter={fmt} />
                    {/* Tooltip kept (so the chart still reports the hovered year for dragging) but rendered invisibly — no bubble, no cursor line. */}
                    <Tooltip cursor={false} content={() => null} />
                    <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} />
                    <Line type="monotone" dataKey="NetWorth" stroke="url(#nwGradient)" strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false} />
                    {chart.markers.map((m) => (
                      <ReferenceDot
                        key={m.id}
                        x={m.x}
                        y={m.y}
                        ifOverflow="extendDomain"
                        isAnimationActive={false}
                        shape={({ cx, cy }) => {
                          const active = drag && drag.id === m.id;
                          const r = active ? 14 : 12;
                          return (
                            <g onMouseDown={() => startDrag(m.id, m.x)} style={{ cursor: "ew-resize" }}>
                              <circle cx={cx} cy={cy} r={r} fill="var(--card)" stroke={m.color} strokeWidth={2.5} />
                              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={active ? 16 : 13} style={{ pointerEvents: "none" }}>{planIcon(m.kind)}</text>
                            </g>
                          );
                        }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
              <ul className="foresight-legend">
                {[...chart.markers].sort((a, b) => a.x - b.x).map((m) => (
                  <li key={m.id} className="legend-clickable" onClick={() => openEdit(m.id)} title="Edit plan"><span className="legend-ico" aria-hidden="true">{planIcon(m.kind)}</span><strong>{m.name}</strong><span className="muted"> — {m.status}</span></li>
                ))}
                {chart.ro && (
                  <li><span className="legend-ico" aria-hidden="true">⚠️</span><span className="neg">Savings run out in {chart.ro}</span><span className="muted"> — after retirement, spending draws the balance below zero.</span></li>
                )}
              </ul>
            </section>
          )}

          {budgetTable && (budgetTable.incomeRows.length > 0 || budgetTable.expenseRows.length > 0) && (
            <section className="card">
              <div className="widget-head">
                <div>
                  <span className="muted">Projected budget by year</span>
                  <span className="muted drag-hint">Annual $. Tweak any cell to rebalance; 🔒 cells are set by a plan — edit the plan to change those. Over-budget years are red.</span>
                </div>
              </div>
              <div className="budget-proj-wrap">
                <table className="budget-proj-table">
                  <thead>
                    <tr>
                      <th className="bt-row-head">Category</th>
                      {budgetTable.years.map((y, i) => (
                        <th key={y} className={`right ${budgetTable.totals[i].net < 0 ? "neg" : ""}`}>{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bt-section"><td className="bt-row-head">Income</td>{budgetTable.years.map((y) => <td key={y} />)}</tr>
                    {budgetTable.incomeRows.map((row) => (
                      <tr key={`i-${row.category}`}>
                        <td className="bt-row-head">{row.category}</td>
                        {row.cells.map((cell) => (
                          <td key={cell.year} className="right">
                            {cell.locked
                              ? <span className="bt-locked" title="Set by a plan — edit the plan to change">{fmt(cell.value)} 🔒</span>
                              : <input type="number" className="bt-input" defaultValue={cell.value} key={`${row.category}-${cell.year}-${cell.value}`} onBlur={(e) => setOverride(row.category, cell.year, e.target.value)} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bt-subtotal"><td className="bt-row-head">Total income</td>{budgetTable.totals.map((t) => <td key={t.year} className="right">{fmt(t.income)}</td>)}</tr>

                    <tr className="bt-section"><td className="bt-row-head">Expense</td>{budgetTable.years.map((y) => <td key={y} />)}</tr>
                    {budgetTable.expenseRows.map((row) => (
                      <tr key={`e-${row.category}`}>
                        <td className="bt-row-head">{row.category}</td>
                        {row.cells.map((cell) => (
                          <td key={cell.year} className="right">
                            {cell.locked
                              ? <span className="bt-locked" title="Set by a plan — edit the plan to change">{fmt(cell.value)} 🔒</span>
                              : <input type="number" className="bt-input" defaultValue={cell.value} key={`${row.category}-${cell.year}-${cell.value}`} onBlur={(e) => setOverride(row.category, cell.year, e.target.value)} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bt-subtotal"><td className="bt-row-head">Total expense</td>{budgetTable.totals.map((t) => <td key={t.year} className="right">{fmt(t.expense)}</td>)}</tr>

                    <tr className="bt-net"><td className="bt-row-head">Net / yr</td>{budgetTable.totals.map((t) => <td key={t.year} className={`right ${t.net < 0 ? "neg" : "pos"}`}>{fmt(t.net)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}
