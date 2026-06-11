import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { categoryIcon } from "./institutions.js";
import { fileToIcon } from "./imageIcon.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const EXPENSE_PRESETS = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Transfers", "Fees", "Other",
];
const INCOME_PRESETS = [
  "Salary", "Freelance", "Business", "Investments", "Rental", "Other income",
];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default function BudgetTab({ txns }) {
  const [budgets, setBudgets] = useState([]); // [{ id, category, amount, type }]
  const [rollover, setRollover] = useState(false);
  const [adding, setAdding] = useState(null); // null | "income" | "expense"
  const [newCat, setNewCat] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const month = new Date().toISOString().slice(0, 7);
  const prevMonth = useMemo(() => {
    const d = new Date(month + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [month]);

  async function load() {
    try {
      const [rows, settings] = await Promise.all([api.listBudgets(), api.getSettings()]);
      setRollover(settings.budget_rollover === "1");
      // Seed the preset expense categories once for a brand-new user.
      if (rows.length === 0 && settings.budget_seeded !== "1") {
        await Promise.all(EXPENSE_PRESETS.map((c) => api.setBudget(c, 0, undefined, "expense")));
        await api.setSetting("budget_seeded", "1");
        setBudgets(await api.listBudgets());
      } else {
        setBudgets(rows);
      }
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Actual transactions this month, by category, split by income vs expense.
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

  // With rollover on, last month's unused (or overspend) carries into this month.
  function effectiveLimit(cat, limit) {
    if (!rollover || limit <= 0) return limit;
    return Math.max(0, limit + (limit - (prevSpent[cat] || 0)));
  }

  async function saveLimit(cat, value) {
    await api.setBudget(cat, Math.max(0, Number(value) || 0));
    load();
  }
  async function removeCat(cat) {
    await api.removeBudgetCategory(cat);
    load();
  }
  async function addCat(e) {
    e.preventDefault();
    const cat = (newCat === "__custom__" ? customCat : newCat).trim();
    if (!cat) return;
    await api.setBudget(cat, Number(newLimit) || 0, undefined, adding);
    setNewCat("");
    setCustomCat("");
    setNewLimit("");
    setAdding(null);
    load();
  }
  function toggleAdd(type) {
    setNewCat("");
    setCustomCat("");
    setNewLimit("");
    setAdding((cur) => (cur === type ? null : type));
  }

  const totals = useMemo(() => {
    const income = incomeBudgets.reduce((s, b) => s + (b.amount || 0), 0);
    const expenses = expenseBudgets.reduce((s, b) => s + effectiveLimit(b.category, b.amount), 0);
    return { income, expenses, net: income - expenses };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, rollover, prevSpent]);

  const [yy, mo] = month.split("-");
  const monthName = `${MONTHS[Number(mo) - 1]} ${yy}`;

  // Render functions (not nested components) so the controlled inputs keep focus
  // across the parent re-renders that happen on each keystroke.
  const addForm = (type) => {
    const taken = budgets.map((b) => b.category);
    const presets = (type === "income" ? INCOME_PRESETS : EXPENSE_PRESETS).filter((p) => !taken.includes(p));
    return (
      <form className="budget-add" onSubmit={addCat}>
        <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
          <option value="">Choose a category…</option>
          {presets.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {newCat === "__custom__" && (
          <input
            placeholder="Custom category name"
            value={customCat}
            onChange={(e) => setCustomCat(e.target.value)}
          />
        )}
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={type === "income" ? "Amount / mo" : "Limit (optional)"}
          value={newLimit}
          onChange={(e) => setNewLimit(e.target.value)}
        />
        <button className="btn primary sm" type="submit">Add</button>
      </form>
    );
  };

  const renderRow = (b, kind) => {
    const limit = b.amount || 0;
    const eff = kind === "expense" ? effectiveLimit(b.category, limit) : limit;
    const actual = kind === "expense" ? spent[b.category] || 0 : received[b.category] || 0;
    const pct = eff > 0 ? (actual / eff) * 100 : 0;
    const over = kind === "expense" && eff > 0 && actual > eff;
    return (
      <li key={b.id} className="budget-row">
        <span className="budget-cat">
          <label className="budget-icon" title="Upload a custom icon">
            {b.icon ? (
              <img src={b.icon} alt="" />
            ) : (
              <span className="budget-emoji">{categoryIcon(b.category)}</span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  try {
                    await api.setBudget(b.category, undefined, await fileToIcon(file));
                    load();
                  } catch {
                    /* ignore */
                  }
                }
                e.target.value = "";
              }}
            />
          </label>
          {b.category}
        </span>
        <div className="budget-bar">
          <div
            className={`budget-fill ${over ? "over" : ""} ${kind === "income" ? "income" : ""}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className={`budget-spent ${over ? "neg" : "muted"}`}>
          {fmt(actual)}{eff > 0 ? ` / ${fmt(eff)}` : ""}
        </span>
        <span className="budget-limit-edit">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={kind === "income" ? "Amount" : "Limit"}
            defaultValue={limit || ""}
            onBlur={(e) => saveLimit(b.category, e.target.value)}
          />
        </span>
        <button className="x" title="Remove category" onClick={() => removeCat(b.category)}>×</button>
      </li>
    );
  };

  return (
    <div className="budget-tab">
      <section className="stats">
        <div className="card stat">
          <span className="muted">Income ({monthName})</span>
          <strong className="pos">{fmt(totals.income)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Expenses</span>
          <strong className="neg">{fmt(totals.expenses)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Net / month</span>
          <strong className={totals.net >= 0 ? "pos" : "neg"}>{fmt(totals.net)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="widget-head">
          <p className="muted budget-hint">
            Expected monthly income by source. Bars reflect income received this month.
          </p>
          <button className="link" onClick={() => toggleAdd("income")}>
            {adding === "income" ? "Cancel" : "+ Add income"}
          </button>
        </div>

        {adding === "income" && addForm("income")}

        {incomeBudgets.length === 0 ? (
          <p className="muted empty sm">No income sources yet. Add one above.</p>
        ) : (
          <ul className="budget-list">
            {incomeBudgets.map((b) => renderRow(b, "income"))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="widget-head">
          <p className="muted budget-hint">
            Monthly limits per category{rollover ? " · rollover on (last month's leftover carries over)" : ""}.
            Bars reflect this month's spending.
          </p>
          <button className="link" onClick={() => toggleAdd("expense")}>
            {adding === "expense" ? "Cancel" : "+ Add category"}
          </button>
        </div>

        {adding === "expense" && addForm("expense")}

        {expenseBudgets.length === 0 ? (
          <p className="muted empty sm">No categories yet. Add one above.</p>
        ) : (
          <ul className="budget-list">
            {expenseBudgets.map((b) => renderRow(b, "expense"))}
          </ul>
        )}
      </section>
    </div>
  );
}
