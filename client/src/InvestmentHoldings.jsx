import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pctText = (n) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

const emptyForm = { ticker: "", quantity: "", price: "", date: "" };

export default function InvestmentHoldings({ accountId, onChange }) {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchSeq = useRef(0);

  async function load() {
    setLoading(true);
    try {
      setHoldings(await api.listHoldings(accountId));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [accountId]);

  // Debounced ticker search.
  useEffect(() => {
    if (!modal) return;
    const q = form.ticker.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(q);
        if (seq === searchSeq.current) setSuggestions(res);
      } catch {
        if (seq === searchSeq.current) setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form.ticker, modal]);

  // Close modal on Escape.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  function openModal() {
    setForm(emptyForm);
    setSuggestions([]);
    setShowSuggest(false);
    setModal(true);
  }
  function closeModal() {
    setModal(false);
    setShowSuggest(false);
  }
  function pickSuggestion(s) {
    setForm((f) => ({ ...f, ticker: s.symbol }));
    setShowSuggest(false);
  }

  // All fields are required — no submitting a half-filled holding.
  const valid =
    form.ticker.trim() &&
    Number(form.quantity) > 0 &&
    Number(form.price) > 0 &&
    form.date;

  async function submit(e) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.addHolding(accountId, {
        ticker: form.ticker.trim(),
        quantity: Number(form.quantity),
        purchase_price: Number(form.price),
        purchase_date: form.date,
      });
      closeModal();
      await load();
      onChange && onChange();
    } finally {
      setSaving(false);
    }
  }
  async function remove(id) {
    await api.deleteHolding(id);
    await load();
    onChange && onChange();
  }

  return (
    <div className="holdings">
      <div className="holdings-head">
        <span className="muted">Holdings</span>
        <button className="link sm" onClick={openModal}>+ Add stock</button>
      </div>

      {loading ? (
        <p className="muted sm">Loading live prices…</p>
      ) : holdings.length === 0 ? (
        <p className="muted sm">No stocks yet. Add one to start tracking growth.</p>
      ) : (
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="right">Qty</th>
              <th className="right">Buy</th>
              <th className="right">Price</th>
              <th className="right">Value</th>
              <th className="right">Gain</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>
                  <strong>{h.ticker}</strong>
                  {h.purchase_date && <div className="muted hd-sub">{h.purchase_date}</div>}
                </td>
                <td className="right">{h.quantity}</td>
                <td className="right">{fmt(h.purchase_price)}</td>
                <td className="right">{h.price != null ? fmt(h.price) : <span className="muted">—</span>}</td>
                <td className="right">{fmt(h.marketValue)}</td>
                <td className={`right ${h.gain >= 0 ? "pos" : "neg"}`}>
                  {fmt(h.gain)}
                  <div className="hd-sub">{pctText(h.gainPct)}</div>
                </td>
                <td className="right">
                  <button className="x" onClick={() => remove(h.id)} title="Delete">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && holdings.some((h) => h.price == null) && (
        <p className="muted sm">Some prices couldn't be fetched — showing cost basis for those.</p>
      )}

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <span className="modal-title">Add stock</span>
              <button className="modal-close" onClick={closeModal} aria-label="Close">×</button>
            </div>
            <form className="modal-form" onSubmit={submit}>
              <div className="field">
                <label>Ticker</label>
                <div className="ticker-wrap">
                  <input
                    placeholder="Search e.g. NVDA, Apple…"
                    value={form.ticker}
                    onChange={(e) => {
                      set("ticker")(e);
                      setShowSuggest(true);
                    }}
                    onFocus={() => setShowSuggest(true)}
                    onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                    autoFocus
                    autoComplete="off"
                  />
                  {showSuggest && suggestions.length > 0 && (
                    <div className="ticker-suggest">
                      {suggestions.map((s) => (
                        <div
                          key={`${s.symbol}-${s.exchange}`}
                          className="suggest-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                        >
                          <span className="suggest-sym">{s.symbol}</span>
                          <span className="suggest-desc">{s.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Quantity</label>
                  <input type="number" step="any" min="0" placeholder="0" value={form.quantity} onChange={set("quantity")} />
                </div>
                <div className="field">
                  <label>Purchase price</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={set("price")} />
                </div>
                <div className="field">
                  <label>Purchase date</label>
                  <input type="date" value={form.date} onChange={set("date")} />
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn ghost" type="button" onClick={closeModal}>Cancel</button>
                <button className="btn primary" type="submit" disabled={!valid || saving}>
                  {saving ? "Adding…" : "Add stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
