import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { mergeSubscriptions, monthlyCost } from "../subscriptions.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function SubscriptionsWidget({ txns }) {
  const [manual, setManual] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");

  async function load() {
    try {
      setManual(await api.listSubscriptions());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  const merged = useMemo(() => mergeSubscriptions(manual, txns), [manual, txns]);

  async function addSub(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addSubscription({ name: name.trim(), amount: Number(amount) || 0, cadence });
    setName("");
    setAmount("");
    setCadence("monthly");
    setAdding(false);
    load();
  }
  async function remove(id) {
    await api.deleteSubscription(id);
    load();
  }

  return (
    <section className="card widget widget-md">
      <div className="widget-head">
        <div>
          <span className="muted">Subscriptions</span>
          <div className="widget-value neg">
            {fmt(merged.totalMonthly)}<span className="muted unit"> / mo</span>
          </div>
        </div>
        <button className="link" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <div className="sub-summary muted">
        {merged.monthlyCount} monthly · {merged.annualCount} annual · ~{fmt(merged.totalAnnual)}/yr
      </div>

      {adding && (
        <form className="sub-add" onSubmit={addSub}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="sub-add-row">
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
            <button className="btn primary sm">Save</button>
          </div>
        </form>
      )}

      {merged.all.length === 0 ? (
        <p className="muted empty sm">No subscriptions detected yet. Add one or import statements.</p>
      ) : (
        <ul className="sub-list">
          {merged.all.map((s, i) => (
            <li key={s.id ?? `auto-${i}`} className="sub">
              <span className="sub-name">
                {s.name}
                {s.source === "auto" && <span className="sub-tag" title="Auto-detected">auto</span>}
              </span>
              <span className="sub-cad muted">{s.cadence === "annual" ? "yr" : "mo"}</span>
              <span className="sub-amt">{fmt(monthlyCost(s))}<span className="muted">/mo</span></span>
              {s.source === "manual" ? (
                <button className="x" title="Delete" onClick={() => remove(s.id)}>×</button>
              ) : (
                <span className="x-spacer" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
