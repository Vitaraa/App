import { useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { parseStatementFile } from "./statementParser.js";
import { computeInsights } from "./insights.js";
import { shortenMerchant } from "./merchant.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other", "Uncategorized",
];

export default function Transactions({ txns, reload }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editCat, setEditCat] = useState("");
  const [expandedId, setExpandedId] = useState(null); // row showing full description
  const [filter, setFilter] = useState("all"); // all | review

  const insights = useMemo(() => computeInsights(txns), [txns]);

  const visible = useMemo(
    () => (filter === "review" ? txns.filter((t) => t.needs_review) : txns),
    [txns, filter]
  );
  const reviewCount = useMemo(
    () => txns.filter((t) => t.needs_review).length,
    [txns]
  );

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setImportMsg("");
    setBusy(true);
    try {
      const items = await parseStatementFile(file);
      if (!items.length) {
        setError(
          "Couldn't find any transactions in that file. CSV exports work best; " +
          "for PDFs, layouts vary — try your bank's CSV download if available."
        );
        return;
      }
      const res = await api.importTransactions(items);
      const parts = [`Imported ${res.imported}`];
      if (res.flagged) parts.push(`${res.flagged} flagged for review`);
      if (res.skipped) parts.push(`${res.skipped} skipped (duplicates)`);
      setImportMsg(parts.join(" · "));
      reload();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditCat(t.category);
  }
  async function saveEdit(t) {
    try {
      await api.updateTransaction(t.id, { category: editCat, type: t.type });
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }
  async function remove(id) {
    try {
      await api.deleteTransaction(id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tx-tab">
      {error && <div className="error">{error}</div>}

      {/* Insights summary box */}
      <section className="card insight-box">
        <div className="insight-head">
          <span className="muted">Insights</span>
        </div>
        <ul className="insight-list">
          {insights.map((ins, i) => (
            <li key={i} className={`insight insight-${ins.severity}`}>
              <span className="insight-dot" aria-hidden>
                {ins.severity === "warn" ? "⚠" : ins.severity === "good" ? "↓" : "•"}
              </span>
              <span>{ins.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Import */}
      <section className="card import-card">
        <div className="import-row">
          <div>
            <strong>Import a statement</strong>
            <p className="muted import-hint">
              Upload a CSV or PDF e-statement. Transactions are auto-categorized;
              anything uncertain is flagged with ⚠ for you to review.
            </p>
          </div>
          <div className="import-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.pdf,.txt,text/csv,application/pdf"
              onChange={onFile}
              disabled={busy}
              className="file-input"
            />
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Importing…" : "Choose file"}
            </button>
          </div>
        </div>
        {importMsg && <div className="import-msg">{importMsg}</div>}
      </section>

      {/* Transactions table */}
      <section className="card">
        <div className="tx-toolbar">
          <span className="muted">
            {visible.length} transaction{visible.length === 1 ? "" : "s"}
          </span>
          <div className="tx-filters">
            <button
              className={`chip ${filter === "all" ? "chip-on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`chip ${filter === "review" ? "chip-on" : ""}`}
              onClick={() => setFilter("review")}
            >
              Needs review{reviewCount ? ` (${reviewCount})` : ""}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="muted empty">
            {filter === "review"
              ? "Nothing to review — every transaction has a category."
              : "No transactions yet. Import a statement above to get started."}
          </p>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className={t.needs_review ? "row-review" : ""}>
                  <td className="muted nowrap">{t.date}</td>
                  <td className="desc">
                    {t.description ? (
                      <button
                        className={`desc-btn ${expandedId === t.id ? "expanded" : ""}`}
                        title="Click to show the full description"
                        onClick={() =>
                          setExpandedId(expandedId === t.id ? null : t.id)
                        }
                      >
                        {expandedId === t.id
                          ? t.description
                          : shortenMerchant(t.description)}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {editingId === t.id ? (
                      <span className="edit-cat">
                        <select
                          value={editCat}
                          onChange={(e) => setEditCat(e.target.value)}
                          autoFocus
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <button className="link" onClick={() => saveEdit(t)}>Save</button>
                        <button className="link muted" onClick={() => setEditingId(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className="cat-pill" onClick={() => startEdit(t)} title="Click to edit category">
                        {!!t.needs_review && <span className="warn-flag" title="Uncertain — please review">⚠</span>}
                        {t.category}
                      </button>
                    )}
                  </td>
                  <td className={`right nowrap ${t.type === "income" ? "pos" : "neg"}`}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </td>
                  <td className="right">
                    <button className="x" onClick={() => remove(t.id)} title="Delete">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
