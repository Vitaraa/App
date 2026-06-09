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
  const [expandedId, setExpandedId] = useState(null); // row showing full description
  const [filter, setFilter] = useState("all"); // all | review
  const [sort, setSort] = useState("date-desc"); // date-desc | date-asc | amount-desc | amount-asc

  const insights = useMemo(() => computeInsights(txns), [txns]);

  const visible = useMemo(() => {
    const base = filter === "review" ? txns.filter((t) => t.needs_review) : txns;
    const arr = [...base];
    switch (sort) {
      case "date-asc":
        arr.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        break;
      case "amount-desc":
        arr.sort((a, b) => b.amount - a.amount);
        break;
      case "amount-asc":
        arr.sort((a, b) => a.amount - b.amount);
        break;
      case "date-desc":
      default:
        arr.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    }
    return arr;
  }, [txns, filter, sort]);
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

  // Changing the dropdown saves immediately — no separate Save click.
  async function changeCategory(t, category) {
    if (category === t.category) return;
    try {
      await api.updateTransaction(t.id, { category, type: t.type });
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
          <div className="tx-controls">
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
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              title="Sort transactions"
            >
              <option value="date-desc">Date: newest first</option>
              <option value="date-asc">Date: oldest first</option>
              <option value="amount-desc">Amount: high to low</option>
              <option value="amount-asc">Amount: low to high</option>
            </select>
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
                    <div className="cat-cell">
                      {!!t.needs_review && (
                        <span className="warn-flag" title="Uncertain — please review">⚠</span>
                      )}
                      <select
                        className={`cat-select ${t.needs_review ? "cat-review" : ""}`}
                        value={t.category}
                        onChange={(e) => changeCategory(t, e.target.value)}
                        title="Change category"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
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
