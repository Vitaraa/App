import { useEffect, useState } from "react";
import { api } from "./api.js";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pctText = (n) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

export default function InvestmentHoldings({ accountId, onChange }) {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");

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

  async function add(e) {
    e.preventDefault();
    if (!ticker.trim()) return;
    await api.addHolding(accountId, {
      ticker: ticker.trim(),
      quantity: Number(quantity) || 0,
      purchase_price: Number(price) || 0,
      purchase_date: date || null,
    });
    setTicker("");
    setQuantity("");
    setPrice("");
    setDate("");
    setAdding(false);
    await load();
    onChange && onChange();
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
        <button className="link sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add stock"}
        </button>
      </div>

      {adding && (
        <form className="holding-add" onSubmit={add}>
          <input placeholder="Ticker (e.g. AAPL)" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <input type="number" step="any" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <input type="number" step="0.01" placeholder="Buy price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn primary sm" type="submit">Add</button>
        </form>
      )}

      {loading ? (
        <p className="muted sm">Loading live prices…</p>
      ) : holdings.length === 0 ? (
        <p className="muted sm">No stocks yet. Add one above to start tracking growth.</p>
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
    </div>
  );
}
