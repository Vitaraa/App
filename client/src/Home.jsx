import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./ds.jsx";
import { NetWorthChart, CashFlowBars, fmt } from "./charts.jsx";
import { typeLabel } from "./institutions.js";
import { cashFlowSeries, netWorthSeries, accountsNetWorth } from "./timeseries.js";

const CAT_COLORS = {
  Income: "#4f9a6a", Groceries: "#7a9a52", Dining: "#cf6b3f", Transport: "#5a8aa8",
  Shopping: "#b06a8c", Subscriptions: "#8a6fae", Utilities: "#9a8048",
  Housing: "#c0763e", Health: "#c06070", Education: "#6a90ae",
  Entertainment: "#8a7a4a", Insurance: "#7a8a60", Other: "#a39785",
};
const catColor = (cat) => CAT_COLORS[cat] ?? "#a39785";
const acctVal = (a) => (a.value != null ? Number(a.value) : Number(a.balance ?? 0));
const hexA = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Other",
];

const ACCOUNT_ICONS = {
  chequing: "bank", savings: "piggy", cash: "wallet", investment: "chart",
  credit_card: "card", mortgage: "home", line_of_credit: "card",
  student_loan: "file", auto_loan: "card", other: "wallet",
};

/* ============================================================
   SPENDING RING
   ============================================================ */
function SpendRing({ spent, budget }) {
  const R = 72, C = 2 * Math.PI * R, sz = 168;
  const pct = Math.min(1, budget > 0 ? spent / budget : 0);
  const over = budget > 0 && spent > budget;
  const remaining = budget - spent;
  return (
    <div className="ring-wrap">
      <div className="ring-center">
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
          <circle cx={sz / 2} cy={sz / 2} r={R} fill="none" stroke="var(--input-bg)" strokeWidth="14" />
          <circle cx={sz / 2} cy={sz / 2} r={R} fill="none"
            stroke={over ? "var(--red)" : "var(--accent)"} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${pct * C} ${C}`} />
        </svg>
        <div className="ring-mid">
          <span className="rm-big" style={{ color: over ? "var(--red)" : "var(--text)" }}>
            {fmt(Math.abs(remaining), 0)}
          </span>
          <span className="rm-small">{over ? "over budget" : "left"}</span>
        </div>
      </div>
      <div className="ring-legend">
        <div><span className="ll">Spent</span><span className="lv">{fmt(spent, 0)}</span></div>
        <div><span className="ll">Budget</span><span className="lv">{budget > 0 ? fmt(budget, 0) : "—"}</span></div>
      </div>
    </div>
  );
}

/* ============================================================
   HOME DASHBOARD
   ============================================================ */
export default function Home({ txns, reload, theme, setTheme, onSettings }) {
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [range, setRange] = useState(12);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => {});
    api.listGoals?.().then(setGoals).catch(() => {});
    api.listBudgets?.().then(setBudgets).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

  /* ---- KPI ---- */
  const kpi = useMemo(() => {
    const series = cashFlowSeries(txns, "month");
    if (!series.length) return { income: 0, spending: 0, net: 0, rate: 0, incomeDelta: 0, spendingDelta: 0 };
    const latest = series[series.length - 1];
    const prior = series.slice(0, -1);
    const mean = (k) => prior.length ? prior.reduce((s, p) => s + p[k], 0) / prior.length : latest[k];
    const income = latest.income, spending = latest.expense, net = latest.net;
    return {
      income, spending, net,
      rate: income > 0 ? Math.round((net / income) * 100) : 0,
      incomeDelta: income - mean("income"),
      spendingDelta: spending - mean("expense"),
    };
  }, [txns]);

  /* ---- Net worth ---- */
  const anchor = accounts.length ? accountsNetWorth(accounts) : null;
  const nwSeries = useMemo(() => netWorthSeries(txns, "month", anchor), [txns, anchor]);
  const visible = nwSeries.slice(-range);
  const current = visible.length ? visible[visible.length - 1].value : anchor ?? 0;
  const startVal = visible.length ? visible[0].value : 0;
  const delta = current - startVal;
  const pct = startVal ? (delta / Math.abs(startVal)) * 100 : 0;

  /* ---- Spending ring ---- */
  const thisMonthTxns = useMemo(() => {
    const now = new Date();
    return txns.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.type === "expense";
    });
  }, [txns]);

  const totalSpent = thisMonthTxns.reduce((s, t) => s + t.amount, 0);
  const totalBudget = budgets.filter((b) => b.type !== "income").reduce((s, b) => s + (b.amount ?? 0), 0);

  /* ---- Category breakdown ---- */
  const catMap = useMemo(() => {
    const m = {};
    thisMonthTxns.forEach((t) => { m[t.category] = (m[t.category] ?? 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [thisMonthTxns]);

  /* ---- Cash flow 6-month bars ---- */
  const cfData = useMemo(() => {
    const series = cashFlowSeries(txns, "month");
    return series.slice(-6).map((s) => ({
      m: new Date(s.period + "-01T00:00:00").toLocaleDateString("en-CA", { month: "short" }),
      in: s.income, out: s.expense,
    }));
  }, [txns]);

  /* ---- Recent transactions ---- */
  const recent = useMemo(() => [...txns].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5), [txns]);

  const RANGES = [["3M", 3], ["6M", 6], ["1Y", 12]];

  return (
    <>
      {/* ---- Page head ---- */}
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">{today} · Here's where your money stands today.</p>
        </div>
        <div className="head-actions">
          <div className="theme-tog">
            <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>
              <Icon name="sun" style={{ width: 13, height: 13 }} /> Light
            </button>
            <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>
              <Icon name="moon" style={{ width: 13, height: 13 }} /> Dark
            </button>
          </div>
          <button className="btn ghost sm" onClick={onSettings}>
            <Icon name="settings" style={{ width: 15, height: 15 }} />
          </button>
          <button className="btn primary sm" onClick={() => setAdding(true)}>
            <Icon name="plus" style={{ width: 15, height: 15 }} />
            Add transaction
          </button>
        </div>
      </div>

      {/* ---- KPI strip ---- */}
      <div className="card">
        <div className="kpi-row">
          <div className="kpi">
            <span className="kpi-label"><Icon name="income" style={{ width: 13, height: 13, color: "var(--green)" }} />Income</span>
            <span className="kpi-val">{fmt(kpi.income, 0)}</span>
            <span className={"kpi-delta " + (kpi.incomeDelta >= 0 ? "pos" : "neg")}>
              {kpi.incomeDelta >= 0 ? "↑" : "↓"} {fmt(Math.abs(kpi.incomeDelta), 0)} vs avg
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label"><Icon name="expense" style={{ width: 13, height: 13, color: "var(--red)" }} />Spending</span>
            <span className="kpi-val">{fmt(kpi.spending, 0)}</span>
            <span className={"kpi-delta " + (kpi.spendingDelta <= 0 ? "pos" : "neg")}>
              {kpi.spendingDelta <= 0 ? "↓" : "↑"} {fmt(Math.abs(kpi.spendingDelta), 0)} vs avg
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label"><Icon name="wallet" style={{ width: 13, height: 13 }} />Net saved</span>
            <span className={"kpi-val " + (kpi.net >= 0 ? "pos" : "neg")}>{kpi.net >= 0 ? "+" : "−"}{fmt(Math.abs(kpi.net), 0)}</span>
            <span className="kpi-delta muted">this month</span>
          </div>
          <div className="kpi">
            <span className="kpi-label"><Icon name="target" style={{ width: 13, height: 13 }} />Savings rate</span>
            <span className="kpi-val">{kpi.rate}%</span>
            <span className="kpi-delta muted">of income kept</span>
          </div>
        </div>
      </div>

      {/* ---- Main grid ---- */}
      <div className="dash-grid">
        {/* Net worth chart — span 4 */}
        <div className="card widget span4">
          <div className="widget-head">
            <span className="widget-title">Net worth</span>
            <div className="seg">
              {RANGES.map(([label, n]) => (
                <button key={label} className={"seg-btn" + (range === n ? " seg-on" : "")} onClick={() => setRange(n)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="nw-headline">
            <span className="nw-value">{fmt(current)}</span>
            {delta !== 0 && (
              <span className={"kpi-delta " + (delta >= 0 ? "pos" : "neg")}>
                {delta >= 0 ? "↑" : "↓"} {fmt(Math.abs(delta), 0)} ({Math.abs(pct).toFixed(1)}%)
              </span>
            )}
          </div>
          {visible.length > 1 ? (
            <NetWorthChart
              data={visible.map((s) => s.value)}
              labels={visible.map((s) => s.label)}
            />
          ) : (
            <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
              Add transactions to see your net worth over time.
            </p>
          )}
        </div>

        {/* Spending ring — span 2 */}
        <div className="card widget span2">
          <div className="widget-head">
            <span className="widget-eyebrow">This month</span>
            <span className="widget-title">Spending</span>
          </div>
          <SpendRing spent={totalSpent} budget={totalBudget} />
        </div>

        {/* Category breakdown — span 3 */}
        <div className="card widget span3">
          <div className="widget-head">
            <span className="widget-title">Top categories</span>
          </div>
          {catMap.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-xs)", paddingTop: 4 }}>No spending this month.</p>
          ) : (
            <div className="cat-list">
              {catMap.map(([cat, amt]) => {
                const col = catColor(cat);
                const budRow = budgets.find((b) => b.category === cat);
                const budAmt = budRow?.amount ?? 0;
                const pctBar = budAmt > 0 ? Math.min(100, (amt / budAmt) * 100) : 0;
                return (
                  <div key={cat} className="cat-row">
                    <div className="cat-top">
                      <span className="cat-name">
                        <span className="cat-dot" style={{ background: col }} />
                        {cat}
                      </span>
                      <span className="cat-fig">
                        <b>{fmt(amt, 0)}</b>
                        {budAmt > 0 && ` / ${fmt(budAmt, 0)}`}
                      </span>
                    </div>
                    {budAmt > 0 && (
                      <div className="bar">
                        <div
                          className={"bar-fill" + (amt > budAmt ? " over" : "")}
                          style={{ width: pctBar + "%", background: col }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent transactions — span 3 */}
        <div className="card widget span3">
          <div className="widget-head">
            <span className="widget-title">Recent transactions</span>
          </div>
          {recent.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>No transactions yet.</p>
          ) : (
            <div className="txn-list">
              {recent.map((t) => {
                const col = catColor(t.category);
                return (
                  <div key={t.id} className="txn">
                    <span className="txn-ico" style={{ background: hexA(col, 0.13), color: col }}>
                      <Icon name={t.type === "income" ? "income" : "expense"} />
                    </span>
                    <div className="txn-body">
                      <span className="txn-name">{t.description || t.category}</span>
                      <span className="txn-meta">{t.category} · {t.date}</span>
                    </div>
                    <span className={"txn-amt " + (t.type === "income" ? "pos" : "")}>
                      {t.type === "income" ? "+" : "−"}{fmt(t.amount, 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accounts strip — span 6 */}
        {accounts.length > 0 && (
          <div className="card widget span6">
            <div className="widget-head">
              <span className="widget-title">Accounts</span>
              <span className="widget-eyebrow">{accounts.length} linked</span>
            </div>
            <div className="acct-grid" style={{ gridTemplateColumns: `repeat(${Math.min(accounts.length, 5)}, 1fr)` }}>
              {accounts.slice(0, 5).map((a) => {
                const icon = ACCOUNT_ICONS[(a.type ?? "").toLowerCase()] ?? "bank";
                return (
                  <div key={a.id} className="acct">
                    <div className="acct-head">
                      <span className="acct-ico"><Icon name={icon} /></span>
                    </div>
                    <span className="acct-type">{typeLabel(a.type)}</span>
                    <span className="acct-name">{a.name}</span>
                    <span className={"acct-bal " + (acctVal(a) < 0 ? "neg" : "")}>{fmt(acctVal(a))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cash flow bars — span 3 */}
        {cfData.length > 0 && (
          <div className="card widget span3">
            <div className="widget-head">
              <span className="widget-title">Cash flow</span>
              <div className="cf-legend">
                <div className="cf-leg"><span className="sw" style={{ background: "var(--accent)" }} />In</div>
                <div className="cf-leg"><span className="sw" style={{ background: "var(--red)" }} />Out</div>
              </div>
            </div>
            <CashFlowBars data={cfData} />
          </div>
        )}

        {/* Goals — span 3 (only if there are goals) */}
        {goals.length > 0 && (
          <div className="card widget span3">
            <div className="widget-head">
              <span className="widget-title">Goals</span>
            </div>
            {goals.slice(0, 4).map((g) => {
              const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
              return (
                <div key={g.id} className="goal">
                  <div className="goal-top">
                    <span className="goal-name">
                      <span className="goal-emoji">{g.emoji ?? "🎯"}</span>
                      {g.name}
                    </span>
                    <span className="goal-pct">{Math.round(pct)}%</span>
                  </div>
                  <div className="bar">
                    <div className={"bar-fill" + (pct >= 100 ? " done" : "")} style={{ width: pct + "%" }} />
                  </div>
                  <span className="goal-fig">
                    <b>{fmt(g.saved ?? 0, 0)}</b> of {fmt(g.target ?? 0, 0)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && <AddTxnModal onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}

/* ============================================================
   ADD TRANSACTION MODAL
   ============================================================ */
function AddTxnModal({ onClose, onSaved }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) { setError("Enter an amount greater than zero."); return; }
    setSaving(true);
    try {
      await api.addTransaction({
        type, amount: Number(amount),
        category: category.trim() || (type === "income" ? "Income" : "Other"),
        description: description.trim(), date,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message ?? "Could not add transaction.");
      setSaving(false);
    }
  }

  return (
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-modal" role="dialog" aria-modal="true" aria-label="Add transaction">
        <div className="fs-modal-head">
          <div className="fs-modal-title">
            <Icon name={type === "income" ? "income" : "expense"} style={{ width: 20, height: 20 }} />
            Add transaction
          </div>
          <button className="fs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="fs-grid">
            <div className="fs-field full">
              <div className="seg">
                <button type="button" className={"seg-btn" + (type === "expense" ? " seg-on" : "")} onClick={() => setType("expense")}>Expense</button>
                <button type="button" className={"seg-btn" + (type === "income" ? " seg-on" : "")} onClick={() => setType("income")}>Income</button>
              </div>
            </div>
            <div className="fs-field">
              <span>Amount</span>
              <input type="number" step="0.01" min="0" value={amount} placeholder="0.00" autoFocus onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="fs-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="fs-field full">
              <span>Description</span>
              <input value={description} placeholder="e.g. Whole Foods" onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="fs-field full">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{type === "income" ? "Income" : "Other"}</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {error && <div className="fs-field full"><div className="error sm">{error}</div></div>}
          </div>
          <div className="fs-modal-foot">
            <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button>
            <div className="right">
              <button type="submit" className="btn primary sm" disabled={saving}>
                {saving ? "Saving…" : "Add transaction"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
