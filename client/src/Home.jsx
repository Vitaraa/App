import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import PageActions from "./PageActions.jsx";
import { api } from "./api.js";
import { cashFlowSeries, netWorthSeries, accountsNetWorth } from "./timeseries.js";

const fmt0 = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const signed = (n) => (n >= 0 ? "+" : "−") + fmt0(Math.abs(n));

const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other",
];
const RANGES = [["3M", 3], ["6M", 6], ["1Y", 12]];

export default function Home({ txns, reload, theme, setTheme }) {
  const [accounts, setAccounts] = useState([]);
  const [range, setRange] = useState(12);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => {});
  }, []);

  // ---- KPI figures from the latest month with activity ----
  const kpi = useMemo(() => {
    const series = cashFlowSeries(txns, "month");
    if (series.length === 0) {
      return { income: 0, spending: 0, net: 0, rate: 0, incomeDelta: 0, spendingDelta: 0, hasData: false };
    }
    const latest = series[series.length - 1];
    const prior = series.slice(0, -1);
    const mean = (key) => (prior.length ? prior.reduce((s, p) => s + p[key], 0) / prior.length : latest[key]);
    const income = latest.income;
    const spending = latest.expense;
    const net = latest.net;
    return {
      income,
      spending,
      net,
      rate: income > 0 ? Math.round((net / income) * 100) : 0,
      incomeDelta: income - mean("income"),
      spendingDelta: spending - mean("expense"),
      hasData: true,
    };
  }, [txns]);

  // ---- Net-worth series, anchored to real account balances when present ----
  const anchor = accounts.length ? accountsNetWorth(accounts) : null;
  const series = useMemo(() => netWorthSeries(txns, "month", anchor), [txns, anchor]);
  const visible = series.slice(-range);
  const current = visible.length ? visible[visible.length - 1].value : anchor || 0;
  const start = visible.length ? visible[0].value : 0;
  const delta = current - start;
  const pct = start ? (delta / Math.abs(start)) * 100 : 0;

  return (
    <>
      <PageActions>
        <div className="seg">
          <button className={`seg-btn ${theme === "light" ? "seg-on" : ""}`} onClick={() => setTheme("light")}>
            ☀ Light
          </button>
          <button className={`seg-btn ${theme === "dark" ? "seg-on" : ""}`} onClick={() => setTheme("dark")}>
            ☾ Dark
          </button>
        </div>
        <button className="btn primary sm" onClick={() => setAdding(true)}>
          + Add transaction
        </button>
      </PageActions>

      <div className="dash-section">
        <div className="kpi-grid">
          <div className="card kpi-card">
            <span className="kpi-label">Income • this month</span>
            <span className="kpi-value">{fmt0(kpi.income)}</span>
            <span className={`kpi-delta ${kpi.incomeDelta >= 0 ? "pos" : "neg"}`}>
              {kpi.incomeDelta >= 0 ? "↑" : "↓"} {signed(kpi.incomeDelta)} vs avg
            </span>
          </div>

          <div className="card kpi-card">
            <span className="kpi-label">Spending • this month</span>
            <span className="kpi-value">{fmt0(kpi.spending)}</span>
            <span className={`kpi-delta ${kpi.spendingDelta <= 0 ? "pos" : "neg"}`}>
              {kpi.spendingDelta <= 0 ? "↓" : "↑"} {fmt0(Math.abs(kpi.spendingDelta))} vs avg
            </span>
          </div>

          <div className="card kpi-card">
            <span className="kpi-label">Net cash flow</span>
            <span className={`kpi-value ${kpi.net >= 0 ? "pos" : "neg"}`}>
              {kpi.net >= 0 ? "+" : "−"}{fmt0(Math.abs(kpi.net))}
            </span>
            <span className="kpi-delta">saved this month</span>
          </div>

          <div className="card kpi-card">
            <span className="kpi-label">Savings rate</span>
            <span className="kpi-value">{kpi.rate}%</span>
            <span className="kpi-delta">of income kept</span>
          </div>
        </div>

        <section className="card nw-card">
          <div className="nw-top">
            <div>
              <span className="nw-eyebrow">Net worth</span>
              <div className="nw-value">{fmtFull(current)}</div>
            </div>
            <div className="range-seg">
              {RANGES.map(([label, n]) => (
                <button
                  key={label}
                  className={`range-btn ${range === n ? "range-on" : ""}`}
                  onClick={() => setRange(n)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visible.length > 1 && (
            <div className={`pill ${delta >= 0 ? "" : "neg"}`}>
              {delta >= 0 ? "↑" : "↓"} {signed(delta)} {Math.abs(pct).toFixed(1)}%
            </div>
          )}

          {series.length === 0 ? (
            <p className="muted empty">No data yet — add transactions to see your net worth over time.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={visible} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                <Tooltip
                  formatter={(v) => [fmtFull(v), "Net worth"]}
                  labelFormatter={(l) => l}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {adding && <AddTxnModal onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}

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
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await api.addTransaction({
        type,
        amount: Number(amount),
        category: category.trim() || (type === "income" ? "Income" : "Other"),
        description: description.trim(),
        date,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Could not add transaction.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="modal-title">Add transaction</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <div className="seg">
            <button type="button" className={`seg-btn ${type === "expense" ? "seg-on" : ""}`} onClick={() => setType("expense")}>
              Expense
            </button>
            <button type="button" className={`seg-btn ${type === "income" ? "seg-on" : ""}`} onClick={() => setType("income")}>
              Income
            </button>
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" step="0.01" min="0" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={description} placeholder="e.g. Whole Foods" onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{type === "income" ? "Income" : "Other"}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Add transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
