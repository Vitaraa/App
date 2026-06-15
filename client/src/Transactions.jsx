import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { parseStatementFile } from "./statementParser.js";
import { shortenMerchant } from "./merchant.js";
import { Icon } from "./ds.jsx";
import { fmt } from "./charts.jsx";

const CAT_COLORS = {
  Income: "#4f9a6a", Groceries: "#7a9a52", Dining: "#cf6b3f", Transport: "#5a8aa8",
  Shopping: "#b06a8c", Subscriptions: "#8a6fae", Utilities: "#9a8048", Housing: "#c0763e",
  Health: "#c06070", Insurance: "#7a8a60", Entertainment: "#8a7a4a", Education: "#6a90ae",
  Transfers: "#6f8a9a", Fees: "#b07a4a", Other: "#a39785", Uncategorized: "#9a9080",
};
const catColor = (c) => CAT_COLORS[c] ?? "#a39785";
const hexA = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other", "Uncategorized",
];

function dayLabel(date) {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function Transactions({ txns, reload }) {
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("All");
  const [cat, setCat] = useState("All");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [budgetCats, setBudgetCats] = useState([]);

  useEffect(() => {
    api.listBudgets().then((rows) => setBudgetCats(rows.map((r) => r.category))).catch(() => {});
  }, []);

  const allCategories = useMemo(() => {
    const set = new Set(CATEGORIES);
    for (const c of budgetCats) if (c) set.add(c);
    for (const t of txns) if (t.category) set.add(t.category);
    return [...set];
  }, [budgetCats, txns]);

  const presentCats = useMemo(() => {
    const set = new Set();
    txns.forEach((t) => t.category && set.add(t.category));
    return ["All", ...[...set].sort()];
  }, [txns]);

  const reviewCount = useMemo(() => txns.filter((t) => t.needs_review).length, [txns]);

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (reviewOnly && !t.needs_review) return false;
      if (kind === "Income" && t.type !== "income") return false;
      if (kind === "Expenses" && t.type === "income") return false;
      if (cat !== "All" && t.category !== cat) return false;
      if (q) {
        const hay = `${t.description || ""} ${t.category || ""} ${t.account_name || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }, [txns, q, kind, cat, reviewOnly]);

  const inflow = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const outflow = filtered.filter((t) => t.type !== "income").reduce((s, t) => s + t.amount, 0);

  // Group by day, preserving sorted order.
  const days = useMemo(() => {
    const out = [];
    filtered.forEach((t) => {
      let g = out.find((d) => d.day === t.date);
      if (!g) { g = { day: t.date, items: [] }; out.push(g); }
      g.items.push(t);
    });
    return out;
  }, [filtered]);

  async function changeCategory(t, category) {
    if (category === t.category) return;
    try { await api.updateTransaction(t.id, { category, type: t.type }); reload(); }
    catch (err) { setError(err.message); }
  }
  async function remove(id) {
    try { await api.deleteTransaction(id); reload(); }
    catch (err) { setError(err.message); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="page-sub">{txns.length} total{reviewCount ? ` · ${reviewCount} need review` : ""}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost sm" onClick={() => setImportOpen(true)}>
            <span className="btn-ico"><Icon name="upload" /></span>Import
          </button>
          <button className="btn primary sm" onClick={() => setAddOpen(true)}>
            <Icon name="plus" style={{ width: 15, height: 15 }} />Add
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary */}
      <div className="card">
        <div className="txn-summary">
          <div className="txn-sum"><span className="ts-lbl">Showing</span><span className="ts-val">{filtered.length}</span></div>
          <div className="txn-sum"><span className="ts-lbl">Money in</span><span className="ts-val pos">+{fmt(inflow, 0)}</span></div>
          <div className="txn-sum"><span className="ts-lbl">Money out</span><span className="ts-val neg">−{fmt(outflow, 0)}</span></div>
          <div className="txn-sum"><span className="ts-lbl">Net</span><span className={"ts-val " + (inflow - outflow >= 0 ? "pos" : "neg")}>{inflow - outflow >= 0 ? "+" : "−"}{fmt(Math.abs(inflow - outflow), 0)}</span></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="txn-toolbar">
        <div className="txn-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" aria-label="Search transactions" />
        </div>
        <div className="seg">
          {["All", "Income", "Expenses"].map((k) => (
            <button key={k} className={"seg-btn" + (kind === k ? " seg-on" : "")} onClick={() => setKind(k)}>{k}</button>
          ))}
        </div>
        <button className={"fchip" + (reviewOnly ? " on" : "")} onClick={() => setReviewOnly((v) => !v)}>
          <Icon name="alert" style={{ width: 13, height: 13 }} />
          Needs review{reviewCount ? ` (${reviewCount})` : ""}
        </button>
      </div>

      {/* Category chips */}
      <div className="chip-row">
        {presentCats.map((c) => (
          <button key={c} className={"fchip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>
            {c !== "All" && <span className="cdot" style={{ background: catColor(c) }} />}{c}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card widget">
        {days.length === 0 ? (
          <div className="txn-empty">No transactions match your filters.</div>
        ) : (
          <div className="txn-table">
            {days.map((d) => {
              const dayTot = d.items.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * t.amount, 0);
              return (
                <div key={d.day}>
                  <div className="txn-day">
                    <span>{dayLabel(d.day)}</span>
                    <span className="day-tot" style={{ color: dayTot >= 0 ? "var(--green)" : "var(--muted)" }}>
                      {dayTot >= 0 ? "+" : "−"}{fmt(Math.abs(dayTot), 0)}
                    </span>
                  </div>
                  {d.items.map((t) => {
                    const col = catColor(t.category);
                    return (
                      <div className="trow" key={t.id}>
                        <span className="trow-ico" style={{ background: hexA(col, 0.13), color: col }}>
                          <Icon name={t.type === "income" ? "income" : "expense"} />
                        </span>
                        <div className="trow-main">
                          <span className="trow-name" title={t.description || t.category}>
                            {t.description ? shortenMerchant(t.description) : t.category}
                          </span>
                          <div className="trow-tags">
                            {t.needs_review && <Icon name="alert" style={{ width: 13, height: 13, color: "var(--warn)" }} title="Needs review" />}
                            <select className="trow-cat-sel" value={t.category} onChange={(e) => changeCategory(t, e.target.value)} title="Change category"
                              style={{ color: col }}>
                              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <span className="trow-acct" title={t.account_name || ""}>{t.account_name || "—"}</span>
                        <span className={"trow-amt " + (t.type === "income" ? "pos" : "")}>
                          {t.type === "income" ? "+" : "−"}{fmt(t.amount, 2)}
                        </span>
                        <button className="trow-del" onClick={() => remove(t.id)} title="Delete transaction"><Icon name="trash" /></button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addOpen && <AddTxnModal categories={allCategories} onClose={() => setAddOpen(false)} onSaved={reload} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={reload} />}
    </>
  );
}

/* ============================================================
   ADD TRANSACTION MODAL
   ============================================================ */
function AddTxnModal({ categories, onClose, onSaved }) {
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
      onSaved?.(); onClose();
    } catch (err) { setError(err.message || "Could not add transaction."); setSaving(false); }
  }

  return (
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-modal" role="dialog" aria-modal="true">
        <div className="fs-modal-head">
          <div className="fs-modal-title"><Icon name={type === "income" ? "income" : "expense"} style={{ width: 20, height: 20 }} />Add transaction</div>
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
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {error && <div className="fs-field full"><div className="error sm">{error}</div></div>}
          </div>
          <div className="fs-modal-foot">
            <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button>
            <div className="right">
              <button type="submit" className="btn primary sm" disabled={saving}>{saving ? "Saving…" : "Add transaction"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   IMPORT STATEMENT MODAL
   ============================================================ */
function ImportModal({ onClose, onDone }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function handleFile(file) {
    if (!file) return;
    setError(""); setResult(""); setBusy(true);
    try {
      const { items, last4 } = await parseStatementFile(file);
      if (!items.length) {
        setError("Couldn't find any transactions in that file. CSV exports work best; for PDFs, layouts vary — try your bank's CSV download if available.");
        return;
      }
      const res = await api.importTransactions(items, last4);
      const parts = [`Imported ${res.imported}`];
      if (res.flagged) parts.push(`${res.flagged} flagged for review`);
      if (res.skipped) parts.push(`${res.skipped} skipped (duplicates)`);
      if (res.linkedAccount) parts.push(`linked to ${res.linkedAccount}`);
      else if (res.last4) parts.push(`no account matches ··${res.last4}`);
      setResult(parts.join(" · "));
      onDone?.();
    } catch (err) { setError(err.message || "Import failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-modal" role="dialog" aria-modal="true">
        <div className="fs-modal-head">
          <div className="fs-modal-title"><Icon name="upload" style={{ width: 20, height: 20 }} />Import statement</div>
          <button className="fs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <div
            className={"dropzone" + (drag ? " drag" : "")}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
          >
            <span className="dz-ico"><Icon name={busy ? "loader" : "file"} /></span>
            <span className="dz-title">{busy ? "Importing…" : <>Drop a file or <b>browse</b></>}</span>
            <span className="dz-sub">Upload a CSV or PDF e-statement. Transactions are auto-categorized; anything uncertain is flagged for review.</span>
            <span className="dz-formats">CSV · PDF · TXT</span>
            <input ref={fileRef} type="file" accept=".csv,.pdf,.txt,text/csv,application/pdf" style={{ display: "none" }}
              onChange={(e) => { handleFile(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ""; }} disabled={busy} />
          </div>
          {error && <div className="error sm" style={{ marginTop: 14 }}>{error}</div>}
          {result && <div className="notice" style={{ marginTop: 14 }}>{result}</div>}
        </div>
        <div className="fs-modal-foot">
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
