import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { categoryIcon } from "./institutions.js";
import { Icon } from "./ds.jsx";
import { fmt } from "./charts.jsx";

const CAT_COLORS = {
  Groceries: "#7a9a52", Dining: "#cf6b3f", Transport: "#5a8aa8", Subscriptions: "#8a6fae",
  Shopping: "#b06a8c", Utilities: "#9a8048", Housing: "#c0763e", Health: "#c06070",
  Insurance: "#7a8a60", Entertainment: "#8a7a4a", Education: "#6a90ae", Transfers: "#6f8a9a",
  Fees: "#b07a4a", Other: "#a39785",
};
const catColor = (c) => CAT_COLORS[c] ?? "#a39785";

const EXPENSE_PRESETS = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Transfers", "Fees", "Other",
];
const INCOME_PRESETS = ["Salary", "Freelance", "Business", "Investments", "Rental", "Other income"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function BudgetTab({ txns, rollover: rolloverProp, onToggleRollover }) {
  const [budgets, setBudgets] = useState([]);
  const [rollover, setRollover] = useState(rolloverProp ?? false);
  const [adding, setAdding] = useState(null); // null | "income" | "expense"
  const [newCat, setNewCat] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [newLimit, setNewLimit] = useState("");

  useEffect(() => { if (rolloverProp != null) setRollover(rolloverProp); }, [rolloverProp]);

  const month = new Date().toISOString().slice(0, 7);
  const prevMonth = useMemo(() => {
    const d = new Date(month + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [month]);

  async function load() {
    try {
      const [rows, settings] = await Promise.all([api.listBudgets(), api.getSettings()]);
      if (rolloverProp == null) setRollover(settings.budget_rollover === "1");
      if (rows.length === 0 && settings.budget_seeded !== "1") {
        await Promise.all(EXPENSE_PRESETS.map((c) => api.setBudget(c, 0, undefined, "expense")));
        await api.setSetting("budget_seeded", "1");
        setBudgets(await api.listBudgets());
      } else {
        setBudgets(rows);
      }
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  async function toggleRollover() {
    const next = !rollover;
    setRollover(next);
    if (onToggleRollover) onToggleRollover(next);
    else { try { await api.setSetting("budget_rollover", next ? "1" : "0"); } catch {} }
  }

  const actualByMonthCat = useMemo(() => {
    const m = {};
    for (const t of txns) {
      const k = String(t.date).slice(0, 7);
      const side = t.type === "income" ? "income" : "expense";
      (m[k] ||= { income: {}, expense: {} });
      m[k][side][t.category] = (m[k][side][t.category] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txns]);
  const spent = actualByMonthCat[month]?.expense || {};
  const prevSpent = actualByMonthCat[prevMonth]?.expense || {};
  const received = actualByMonthCat[month]?.income || {};

  const incomeBudgets = budgets.filter((b) => b.type === "income");
  const expenseBudgets = budgets.filter((b) => b.type !== "income");

  function effectiveLimit(cat, limit) {
    if (!rollover || limit <= 0) return limit;
    return Math.max(0, limit + (limit - (prevSpent[cat] || 0)));
  }

  async function saveLimit(cat, value) { await api.setBudget(cat, Math.max(0, Number(value) || 0)); load(); }
  async function removeCat(cat) { await api.removeBudgetCategory(cat); load(); }
  async function addCat(e) {
    e.preventDefault();
    const cat = (newCat === "__custom__" ? customCat : newCat).trim();
    if (!cat) return;
    await api.setBudget(cat, Number(newLimit) || 0, undefined, adding);
    setNewCat(""); setCustomCat(""); setNewLimit(""); setAdding(null);
    load();
  }
  function toggleAdd(type) {
    setNewCat(""); setCustomCat(""); setNewLimit("");
    setAdding((cur) => (cur === type ? null : type));
  }

  const totals = useMemo(() => {
    const income = incomeBudgets.reduce((s, b) => s + (b.amount || 0), 0);
    const expenses = expenseBudgets.reduce((s, b) => s + effectiveLimit(b.category, b.amount), 0);
    return { income, expenses, net: income - expenses };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, rollover, prevSpent]);

  const totalSpent = expenseBudgets.reduce((s, b) => s + (spent[b.category] || 0), 0);

  const [yy, mo] = month.split("-");
  const monthName = `${MONTHS[Number(mo) - 1]} ${yy}`;

  // Pace marker: fraction of the month elapsed.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pacePct = (now.getDate() / daysInMonth) * 100;

  // Composition bar segments: each expense category sized by its limit.
  const planTotal = totals.expenses || 1;
  const segs = expenseBudgets
    .filter((b) => effectiveLimit(b.category, b.amount) > 0)
    .map((b) => ({ cat: b.category, amt: effectiveLimit(b.category, b.amount), color: catColor(b.category) }));

  const presetsFor = (type) => {
    const taken = budgets.map((b) => b.category);
    return (type === "income" ? INCOME_PRESETS : EXPENSE_PRESETS).filter((p) => !taken.includes(p));
  };

  const addForm = (type) => (
    <form className="txn-toolbar" onSubmit={addCat} style={{ margin: "4px 0 10px" }}>
      <select value={newCat} onChange={(e) => setNewCat(e.target.value)} style={{ width: "auto", flex: "1 1 160px", marginTop: 0 }}>
        <option value="">Choose a category…</option>
        {presetsFor(type).map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {newCat === "__custom__" && (
        <input placeholder="Custom name" value={customCat} onChange={(e) => setCustomCat(e.target.value)} style={{ width: "auto", flex: "1 1 140px", marginTop: 0 }} />
      )}
      <input type="number" step="0.01" min="0" placeholder={type === "income" ? "Amount / mo" : "Limit (optional)"} value={newLimit}
        onChange={(e) => setNewLimit(e.target.value)} style={{ width: "auto", flex: "1 1 140px", marginTop: 0 }} />
      <button className="btn primary sm" type="submit">Add</button>
    </form>
  );

  const renderRow = (b, kind) => {
    const limit = b.amount || 0;
    const eff = kind === "expense" ? effectiveLimit(b.category, limit) : limit;
    const actual = kind === "expense" ? spent[b.category] || 0 : received[b.category] || 0;
    const pct = eff > 0 ? (actual / eff) * 100 : 0;
    const over = kind === "expense" && eff > 0 && actual > eff;
    const col = kind === "income" ? "var(--green)" : catColor(b.category);
    const remaining = eff - actual;
    return (
      <div className="cat-row" key={b.id}>
        <div className="cat-top">
          <span className="cat-name">
            <span className="goal-emoji" style={{ background: "var(--input-bg)", fontSize: 14 }}>{b.icon ? <img src={b.icon} alt="" style={{ width: 18, height: 18 }} /> : categoryIcon(b.category)}</span>
            {b.category}
            {kind === "expense" && rollover && limit > 0 && <span className="roll-tag">rollover</span>}
          </span>
          <div className="cat-right">
            <span className="cat-fig"><b className={over ? "neg" : ""}>{fmt(actual, 0)}</b> / {fmt(eff, 0)}</span>
            <input type="number" step="0.01" min="0" placeholder={kind === "income" ? "Amount" : "Limit"} defaultValue={limit || ""}
              onBlur={(e) => saveLimit(b.category, e.target.value)}
              style={{ width: 84, marginTop: 0, padding: "5px 8px", fontSize: "var(--text-xs)", textAlign: "right" }} />
            <button className="cat-act del" title="Remove" onClick={() => removeCat(b.category)}><Icon name="trash" /></button>
          </div>
        </div>
        <div className="bar">
          <div className={"bar-fill" + (over ? " over" : "")} style={{ width: Math.min(100, pct) + "%", background: over ? undefined : col }} />
        </div>
        {kind === "expense" && eff > 0 && (
          <span className={"bud-cat-foot" + (remaining < 0 ? " neg" : "")}>
            {remaining >= 0 ? `${fmt(remaining, 0)} left` : `${fmt(-remaining, 0)} over`}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Budget</h1>
          <p className="page-sub">{monthName} · {fmt(totalSpent, 0)} of {fmt(totals.expenses, 0)} planned</p>
        </div>
        <div className="head-actions">
          <span className="roll-toggle">
            Rollover
            <button className={"roll-switch" + (rollover ? " on" : "")} onClick={toggleRollover} aria-label="Toggle rollover">
              <span className="roll-knob" />
            </button>
          </span>
        </div>
      </div>

      {/* KPI */}
      <div className="card">
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="kpi"><span className="kpi-label">Planned income</span><span className="kpi-val pos">{fmt(totals.income, 0)}</span></div>
          <div className="kpi"><span className="kpi-label">Planned expenses</span><span className="kpi-val neg">{fmt(totals.expenses, 0)}</span></div>
          <div className="kpi"><span className="kpi-label">Net / month</span><span className={"kpi-val " + (totals.net >= 0 ? "pos" : "neg")}>{fmt(totals.net, 0)}</span></div>
        </div>
      </div>

      {/* Composition bar */}
      {segs.length > 0 && (
        <div className="card widget">
          <div className="widget-head">
            <span className="widget-title">Spending plan</span>
            <span className="bud-pace-key"><span className="bud-pace-dot" /> today ({Math.round(pacePct)}% of month)</span>
          </div>
          <div className="bud-bar">
            {segs.map((s) => (
              <div key={s.cat} className="bud-seg" style={{ width: (s.amt / planTotal) * 100 + "%", background: s.color }} title={`${s.cat} · ${fmt(s.amt, 0)}`} />
            ))}
            <div className="bud-pace" style={{ left: pacePct + "%" }} />
          </div>
          <div className="bud-legend">
            {segs.map((s) => (
              <span key={s.cat} className="bud-leg"><span className="sw" style={{ background: s.color }} />{s.cat} <b>{fmt(s.amt, 0)}</b></span>
            ))}
          </div>
        </div>
      )}

      {/* Income */}
      <div className="card widget">
        <div className="widget-head">
          <span className="widget-title">Income</span>
          <button className="link sm" onClick={() => toggleAdd("income")}>{adding === "income" ? "Cancel" : "+ Add income"}</button>
        </div>
        {adding === "income" && addForm("income")}
        {incomeBudgets.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>No income sources yet. Add one above.</p>
        ) : (
          <div className="cat-list">{incomeBudgets.map((b) => renderRow(b, "income"))}</div>
        )}
      </div>

      {/* Expenses */}
      <div className="card widget">
        <div className="widget-head">
          <span className="widget-title">Expenses</span>
          <button className="link sm" onClick={() => toggleAdd("expense")}>{adding === "expense" ? "Cancel" : "+ Add category"}</button>
        </div>
        {adding === "expense" && addForm("expense")}
        {expenseBudgets.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>No categories yet. Add one above.</p>
        ) : (
          <div className="cat-list">{expenseBudgets.map((b) => renderRow(b, "expense"))}</div>
        )}
      </div>

      <BudgetGoals />
    </>
  );
}

/* ============================================================
   GOALS
   ============================================================ */
function BudgetGoals() {
  const [goals, setGoals] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");

  async function load() { try { setGoals(await api.listGoals()); } catch {} }
  useEffect(() => { load(); }, []);

  async function addGoal(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addGoal({ name: name.trim(), target: Number(target) || 0, saved: Number(saved) || 0 });
    setName(""); setTarget(""); setSaved(""); setAdding(false);
    load();
  }
  async function updateSaved(g, value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v === g.saved) return;
    await api.updateGoal(g.id, { saved: v });
    load();
  }
  async function remove(id) { await api.deleteGoal(id); load(); }

  return (
    <div className="card widget">
      <div className="widget-head">
        <span className="widget-title">Savings goals</span>
        <button className="link sm" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add goal"}</button>
      </div>

      {adding && (
        <form className="txn-toolbar" onSubmit={addGoal} style={{ margin: "0 0 6px" }}>
          <input placeholder="Goal name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "auto", flex: "1 1 160px", marginTop: 0 }} />
          <input type="number" step="0.01" placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "auto", flex: "1 1 110px", marginTop: 0 }} />
          <input type="number" step="0.01" placeholder="Saved" value={saved} onChange={(e) => setSaved(e.target.value)} style={{ width: "auto", flex: "1 1 110px", marginTop: 0 }} />
          <button className="btn primary sm" type="submit">Save</button>
        </form>
      )}

      {goals.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>No goals yet. Add one to start tracking.</p>
      ) : (
        goals.map((g) => {
          const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
          return (
            <div className="goal" key={g.id}>
              <div className="goal-top">
                <span className="goal-name"><span className="goal-emoji">🎯</span>{g.name}</span>
                <span className="cat-right">
                  <span className="goal-pct">{pct.toFixed(0)}%</span>
                  <button className="cat-act del" title="Delete" onClick={() => remove(g.id)}><Icon name="trash" /></button>
                </span>
              </div>
              <div className="bar"><div className={"bar-fill" + (pct >= 100 ? " done" : "")} style={{ width: pct + "%" }} /></div>
              <span className="goal-fig">
                <input type="number" step="0.01" defaultValue={g.saved} onBlur={(e) => updateSaved(g, e.target.value)}
                  style={{ width: 90, marginTop: 0, padding: "4px 7px", fontSize: "var(--text-2xs)" }} />
                <span style={{ marginLeft: 6 }}>of {fmt(g.target, 0)}</span>
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
