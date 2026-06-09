import { useState } from "react";
import { api } from "../api.js";
import { shortenMerchant } from "../merchant.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function RecentWidget({ txns, reload }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [err, setErr] = useState("");

  async function addTxn(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.addTransaction({
        type,
        amount: Number(amount),
        category: category.trim() || (type === "income" ? "Income" : "Other"),
      });
      setAmount("");
      setCategory("");
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  async function remove(id) {
    await api.deleteTransaction(id);
    reload();
  }

  return (
    <section className="card widget widget-md">
      <div className="widget-head">
        <span className="muted">Recent transactions</span>
      </div>

      <form className="recent-add" onSubmit={addTxn}>
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
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <button className="btn primary sm">Add</button>
      </form>
      {err && <div className="error sm">{err}</div>}

      {txns.length === 0 ? (
        <p className="muted empty sm">No transactions yet.</p>
      ) : (
        <ul className="recent-list">
          {txns.slice(0, 7).map((t) => (
            <li key={t.id}>
              <span className="recent-cat" title={t.description || t.category}>
                {t.description ? shortenMerchant(t.description) : t.category}
              </span>
              <span className="recent-date muted">{t.date.slice(5)}</span>
              <span className={t.type === "income" ? "pos" : "neg"}>
                {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
              </span>
              <button className="x" onClick={() => remove(t.id)} title="Delete">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
