import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import InvestmentsWidget from "./widgets/InvestmentsWidget.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function InvestmentsTab() {
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [h, hist] = await Promise.all([api.listAllHoldings(), api.investmentHistory()]);
      setHoldings(h);
      setHistory(hist);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const h of holdings) {
      value += Number(h.marketValue || 0);
      cost += Number(h.costBasis || 0);
    }
    return { value, cost, gain: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  }, [holdings]);

  // S&P 500 return over the same window, and how the portfolio compares.
  const vsSP = useMemo(() => {
    const spx = history.map((p) => p.spx).filter((v) => v != null);
    if (spx.length < 2) return null;
    const spReturn = ((spx[spx.length - 1] - spx[0]) / spx[0]) * 100;
    return { spReturn, diff: totals.pct - spReturn };
  }, [history, totals.pct]);

  return (
    <div className="investments-tab">
      <InvestmentsWidget />

      <section className="stats">
        <div className="card stat">
          <span className="muted">vs S&amp;P 500</span>
          {vsSP ? (
            <strong className={vsSP.diff >= 0 ? "pos" : "neg"}>
              {vsSP.diff >= 0 ? "+" : ""}{vsSP.diff.toFixed(1)}%
              <span className="muted unit"> (S&amp;P {vsSP.spReturn >= 0 ? "+" : ""}{vsSP.spReturn.toFixed(1)}%)</span>
            </strong>
          ) : (
            <strong className="muted">—</strong>
          )}
        </div>
        <div className="card stat">
          <span className="muted">Invested</span>
          <strong>{fmt(totals.cost)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Total gain</span>
          <strong className={totals.gain >= 0 ? "pos" : "neg"}>
            {fmt(totals.gain)} ({totals.pct >= 0 ? "+" : ""}{totals.pct.toFixed(1)}%)
          </strong>
        </div>
      </section>

      <section className="card">
        <div className="widget-head">
          <span className="muted">Holdings</span>
        </div>
        {loading ? (
          <p className="muted sm">Loading live prices…</p>
        ) : holdings.length === 0 ? (
          <p className="muted empty sm">
            No holdings yet. Add stocks under an investment account in the Accounts tab.
          </p>
        ) : (
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Account</th>
                <th className="right">Qty</th>
                <th className="right">Buy</th>
                <th className="right">Price</th>
                <th className="right">Value</th>
                <th className="right">Gain</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.ticker}</strong>
                    {h.purchase_date && <div className="muted hd-sub">{h.purchase_date}</div>}
                  </td>
                  <td className="muted">{h.account_name}</td>
                  <td className="right">{h.quantity}</td>
                  <td className="right">{fmt(h.purchase_price)}</td>
                  <td className="right">{h.price != null ? fmt(h.price) : <span className="muted">—</span>}</td>
                  <td className="right">{fmt(h.marketValue)}</td>
                  <td className={`right ${h.gain >= 0 ? "pos" : "neg"}`}>
                    {fmt(h.gain)}
                    <div className="hd-sub">{h.gainPct >= 0 ? "+" : ""}{h.gainPct.toFixed(2)}%</div>
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
