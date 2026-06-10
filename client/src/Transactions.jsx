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
  // Sort by a column key with a direction. Click a header to sort / toggle.
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  // Manual add-transaction form.
  const [addOpen, setAddOpen] = useState(false);
  const [aType, setAType] = useState("expense");
  const [aAmount, setAAmount] = useState("");
  const [aCategory, setACategory] = useState("");
  const [aDate, setADate] = useState("");

  const insights = useMemo(() => computeInsights(txns), [txns]);

  async function addManual(e) {
    e.preventDefault();
    setError("");
    try {
      await api.addTransaction({
        type: aType,
        amount: Number(aAmount),
        category: aCategory.trim() || (aType === "income" ? "Income" : "Other"),
        date: aDate || undefined,
      });
      setAAmount("");
      setACategory("");
      setADate("");
      setAddOpen(false);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  // Click a column header: toggle direction if it's already active, otherwise
  // switch to it with a sensible default (newest/highest first for date/amount,
  // A→Z for text columns).
  function toggleSort(key) {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "amount" ? "desc" : "asc" }
    );
  }

  const visible = useMemo(() => {
    const base = filter === "review" ? txns.filter((t) => t.needs_review) : txns;
    const text = (v) => String(v || "");
    const comparators = {
      date: (a, b) => a.date.localeCompare(b.date),
      amount: (a, b) => a.amount - b.amount,
      category: (a, b) =>
        text(a.category).localeCompare(text(b.category), undefined, { sensitivity: "base" }),
      description: (a, b) =>
        shortenMerchant(text(a.description)).localeCompare(
          shortenMerchant(text(b.description)),
          undefined,
          { sensitivity: "base" }
        ),
    };
    const cmp = comparators[sort.key] || comparators.date;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => mul * (cmp(a, b) || a.id - b.id));
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
      const { items, last4 } = await parseStatementFile(file);
      if (!items.length) {
        setError(
          "Couldn't find any transactions in that file. CSV exports work best; " +
          "for PDFs, layouts vary — try your bank's CSV download if available."
        );
        return;
      }
      const res = await api.importTransactions(items, last4);
      const parts = [`Imported ${res.imported}`];
      if (res.flagged) parts.push(`${res.flagged} flagged for review`);
      if (res.skipped) parts.push(`${res.skipped} skipped (duplicates)`);
      if (res.linkedAccount) parts.push(`linked to ${res.linkedAccount}`);
      else if (res.last4) parts.push(`no account matches •${res.last4} (set it on an account to link)`);
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
            <button className="btn ghost" onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? "Cancel" : "+ Add manually"}
            </button>
          </div>
        </div>
        {addOpen && (
          <form className="manual-add" onSubmit={addManual}>
            <select value={aType} onChange={(e) => setAType(e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={aAmount}
              onChange={(e) => setAAmount(e.target.value)}
              required
            />
            <select value={aCategory} onChange={(e) => setACategory(e.target.value)}>
              <option value="">Category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
            <button className="btn primary" type="submit">Add</button>
          </form>
        )}
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
                {[
                  ["date", "Date", ""],
                  ["description", "Description", ""],
                  ["category", "Category", ""],
                  ["amount", "Amount", "right"],
                ].map(([key, label, align]) => (
                  <th key={key} className={align}>
                    <button
                      className={`th-sort ${align} ${sort.key === key ? "th-active" : ""}`}
                      onClick={() => toggleSort(key)}
                      title={`Sort by ${label.toLowerCase()}`}
                    >
                      {label}
                      <span className="th-arrow">
                        {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </th>
                ))}
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
