import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import Transactions from "./Transactions.jsx";

const fmt = (n) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const monthKey = (d) => d.slice(0, 7); // "YYYY-MM"
const monthLabel = (key) =>
  new Date(key + "-01").toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });

export default function Dashboard() {
  const { username, logout } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  // add-form state
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  async function load() {
    try {
      setTxns(await api.listTransactions());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const { income, spending, balance, chart } = useMemo(() => {
    let income = 0;
    let spending = 0;
    const byMonth = {};
    for (const t of txns) {
      const key = monthKey(t.date);
      byMonth[key] ||= { month: key, income: 0, spending: 0 };
      if (t.type === "income") {
        income += t.amount;
        byMonth[key].income += t.amount;
      } else {
        spending += t.amount;
        byMonth[key].spending += t.amount;
      }
    }
    const chart = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => ({ ...m, label: monthLabel(m.month) }));
    return { income, spending, balance: income - spending, chart };
  }, [txns]);

  async function addTxn(e) {
    e.preventDefault();
    setError("");
    try {
      await api.addTransaction({
        type,
        amount: Number(amount),
        category: category.trim() || (type === "income" ? "Income" : "Other"),
      });
      setAmount("");
      setCategory("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    await api.deleteTransaction(id);
    load();
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="brand">Budget</h1>
        <div className="user">
          <span className="muted">{username}</span>
          <button className="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === "overview" ? "tab-on" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${tab === "transactions" ? "tab-on" : ""}`}
          onClick={() => setTab("transactions")}
        >
          Transactions
        </button>
      </nav>

      {error && <div className="error">{error}</div>}

      {tab === "transactions" ? (
        <Transactions txns={txns} reload={load} />
      ) : (
      <>
      <section className="stats">
        <div className="card stat">
          <span className="muted">Income</span>
          <strong className="pos">{fmt(income)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Spending</span>
          <strong className="neg">{fmt(spending)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Balance</span>
          <strong className={balance >= 0 ? "pos" : "neg"}>{fmt(balance)}</strong>
        </div>
      </section>

      <section className="card chart-card">
        <span className="muted">Last 6 months</span>
        {chart.length === 0 ? (
          <p className="muted empty">No data yet — add a transaction below.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="income" fill="var(--green)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spending" fill="var(--red)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="card">
        <form className="add-form" onSubmit={addTxn}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <button className="btn primary">Add</button>
        </form>
      </section>

      {!loading && txns.length > 0 && (
        <section className="card">
          <span className="muted">Recent</span>
          <ul className="txn-list">
            {txns.slice(0, 10).map((t) => (
              <li key={t.id}>
                <span className="txn-cat">{t.category}</span>
                <span className="txn-date muted">{t.date}</span>
                <span className={t.type === "income" ? "pos" : "neg"}>
                  {t.type === "income" ? "+" : "-"}
                  {fmt(t.amount)}
                </span>
                <button className="x" onClick={() => remove(t.id)} title="Delete">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>
      )}
    </div>
  );
}
