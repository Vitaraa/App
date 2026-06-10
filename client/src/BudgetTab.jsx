import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

// Categories a user typically budgets (expense side).
const BUDGET_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Transfers", "Fees", "Other",
];

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default function BudgetTab({ txns }) {
  const [budgets, setBudgets] = useState({}); // category -> amount
  const month = new Date().toISOString().slice(0, 7);

  async function load() {
    try {
      const rows = await api.listBudgets();
      setBudgets(Object.fromEntries(rows.map((b) => [b.category, b.amount])));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Actual spending per category this month.
  const spent = useMemo(() => {
    const m = {};
    for (const t of txns) {
      if (t.type !== "expense") continue;
      if (String(t.date).slice(0, 7) !== month) continue;
      m[t.category] = (m[t.category] || 0) + Number(t.amount || 0);
    }
    return m;
  }, [txns, month]);

  async function saveLimit(category, value) {
    const amount = Number(value) || 0;
    if (amount === (budgets[category] || 0)) return;
    await api.setBudget(category, amount);
    load();
  }

  const totals = useMemo(() => {
    const budgeted = BUDGET_CATEGORIES.reduce((s, c) => s + (budgets[c] || 0), 0);
    const used = BUDGET_CATEGORIES.reduce((s, c) => s + (spent[c] || 0), 0);
    return { budgeted, used, remaining: budgeted - used };
  }, [budgets, spent]);

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
        <p className="muted budget-hint">
          Set a monthly limit per category. Leave a limit at 0 to remove it. Bars and totals
          reflect this month's spending.
        </p>
        <ul className="budget-list">
          {BUDGET_CATEGORIES.map((cat) => {
            const limit = budgets[cat] || 0;
            const used = spent[cat] || 0;
            const pct = limit > 0 ? (used / limit) * 100 : 0;
            const over = limit > 0 && used > limit;
            return (
              <li key={cat} className="budget-row">
                <span className="budget-cat">{cat}</span>
                <div className="budget-bar">
                  <div
                    className={`budget-fill ${over ? "over" : ""}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className={`budget-spent ${over ? "neg" : "muted"}`}>
                  {fmt(used)}{limit > 0 ? ` / ${fmt(limit)}` : ""}
                </span>
                <span className="budget-limit-edit">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Limit"
                    defaultValue={limit || ""}
                    onBlur={(e) => saveLimit(cat, e.target.value)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
