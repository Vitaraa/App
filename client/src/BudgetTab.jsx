import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const PRESETS = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Transfers", "Fees", "Other",
];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default function BudgetTab({ txns }) {
  const [budgets, setBudgets] = useState([]); // [{ id, category, amount }]
  const [rollover, setRollover] = useState(false);
  const [adding, setAdding] = useState(false);
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
      // Seed the preset categories once for a brand-new user.
      if (rows.length === 0 && settings.budget_seeded !== "1") {
        await Promise.all(PRESETS.map((c) => api.setBudget(c, 0)));
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

  const spentByMonthCat = useMemo(() => {
    const m = {};
    for (const t of txns) {
      if (t.type !== "expense") continue;
      const k = String(t.date).slice(0, 7);
      (m[k] ||= {});
      m[k][t.category] = (m[k][t.category] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txns]);
  const spent = spentByMonthCat[month] || {};
  const prevSpent = spentByMonthCat[prevMonth] || {};

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
    await api.setBudget(cat, Number(newLimit) || 0);
    setNewCat("");
    setCustomCat("");
    setNewLimit("");
    setAdding(false);
    load();
  }

  const totals = useMemo(() => {
    const budgeted = budgets.reduce((s, b) => s + effectiveLimit(b.category, b.amount), 0);
    const used = budgets.reduce((s, b) => s + (spent[b.category] || 0), 0);
    return { budgeted, used, remaining: budgeted - used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, spent, rollover, prevSpent]);

  const presetsAvailable = PRESETS.filter((p) => !budgets.some((b) => b.category === p));
  const [y, mo] = month.split("-");
  const monthName = `${MONTHS[Number(mo) - 1]} ${y}`;

  return (
    <div className="budget-tab">
      <section className="stats">
        <div className="card stat">
          <span className="muted">Budgeted ({monthName})</span>
          <strong>{fmt(totals.budgeted)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Spent</span>
          <strong className="neg">{fmt(totals.used)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Remaining</span>
          <strong className={totals.remaining >= 0 ? "pos" : "neg"}>{fmt(totals.remaining)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="widget-head">
          <p className="muted budget-hint">
            Monthly limits per category{rollover ? " · rollover on (last month's leftover carries over)" : ""}.
            Bars reflect this month's spending.
          </p>
          <button className="link" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "+ Add category"}
          </button>
        </div>

        {adding && (
          <form className="budget-add" onSubmit={addCat}>
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              <option value="">Choose a category…</option>
              {presetsAvailable.map((p) => (
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
              placeholder="Limit (optional)"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
            />
            <button className="btn primary sm" type="submit">Add</button>
          </form>
        )}

        {budgets.length === 0 ? (
          <p className="muted empty sm">No categories yet. Add one above.</p>
        ) : (
          <ul className="budget-list">
            {budgets.map((b) => {
              const limit = b.amount || 0;
              const eff = effectiveLimit(b.category, limit);
              const used = spent[b.category] || 0;
              const pct = eff > 0 ? (used / eff) * 100 : 0;
              const over = eff > 0 && used > eff;
              return (
                <li key={b.id} className="budget-row">
                  <span className="budget-cat">{b.category}</span>
                  <div className="budget-bar">
                    <div
                      className={`budget-fill ${over ? "over" : ""}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className={`budget-spent ${over ? "neg" : "muted"}`}>
                    {fmt(used)}{eff > 0 ? ` / ${fmt(eff)}` : ""}
                  </span>
                  <span className="budget-limit-edit">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Limit"
                      defaultValue={limit || ""}
                      onBlur={(e) => saveLimit(b.category, e.target.value)}
                    />
                  </span>
                  <button className="x" title="Remove category" onClick={() => removeCat(b.category)}>×</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
