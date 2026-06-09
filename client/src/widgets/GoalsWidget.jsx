import { useEffect, useState } from "react";
import { api } from "../api.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function GoalsWidget() {
  const [goals, setGoals] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    try {
      setGoals(await api.listGoals());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function addGoal(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addGoal({ name: name.trim(), target: Number(target) || 0, saved: Number(saved) || 0 });
    setName("");
    setTarget("");
    setSaved("");
    setAdding(false);
    load();
  }
  async function updateSaved(g, value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v === g.saved) return;
    await api.updateGoal(g.id, { saved: v });
    load();
  }
  async function remove(id) {
    await api.deleteGoal(id);
    load();
  }

  return (
    <section className="card widget widget-md">
      <div className="widget-head">
        <span className="muted">Savings goals</span>
        <button className="link" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <form className="goal-add" onSubmit={addGoal}>
          <input placeholder="Goal name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="goal-add-row">
            <input
              type="number"
              step="0.01"
              placeholder="Target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Saved"
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
            />
            <button className="btn primary sm">Save</button>
          </div>
        </form>
      )}

      {goals.length === 0 ? (
        <p className="muted empty sm">No goals yet. Add one to start tracking.</p>
      ) : (
        <ul className="goal-list">
          {goals.map((g) => {
            const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const done = pct >= 100;
            return (
              <li key={g.id} className="goal">
                <div className="goal-top">
                  <span className="goal-name">{g.name}</span>
                  <button className="x" title="Delete" onClick={() => remove(g.id)}>×</button>
                </div>
                <div className="goal-bar">
                  <div className={`goal-fill ${done ? "done" : ""}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="goal-meta muted">
                  <input
                    className="goal-saved"
                    type="number"
                    step="0.01"
                    defaultValue={g.saved}
                    onBlur={(e) => updateSaved(g, e.target.value)}
                  />
                  <span> of {fmt(g.target)} · {pct.toFixed(0)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
