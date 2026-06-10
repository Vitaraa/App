import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../api.js";

const fmt0 = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function InvestmentsWidget() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setHoldings(await api.listAllHoldings());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const { data, totalValue, totalGain, gainPct } = useMemo(() => {
    // Combine lots of the same ticker (across accounts).
    const byTicker = {};
    for (const h of holdings) {
      const k = h.ticker;
      (byTicker[k] ||= { ticker: k, invested: 0, value: 0 });
      byTicker[k].invested += Number(h.costBasis || 0);
      byTicker[k].value += Number(h.marketValue || 0);
    }
    const data = Object.values(byTicker)
      .map((d) => ({
        ...d,
        invested: Math.round(d.invested * 100) / 100,
        value: Math.round(d.value * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value);
    const totalValue = data.reduce((s, d) => s + d.value, 0);
    const totalCost = data.reduce((s, d) => s + d.invested, 0);
    const totalGain = totalValue - totalCost;
    return { data, totalValue, totalGain, gainPct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0 };
  }, [holdings]);

  return (
    <section className="card widget widget-md">
      <div className="widget-head">
        <div>
          <span className="muted">Investments</span>
          <div className="widget-value">{fmt(totalValue)}</div>
        </div>
        {data.length > 0 && (
          <div className={`invest-gain ${totalGain >= 0 ? "pos" : "neg"}`}>
            <span>{totalGain >= 0 ? "+" : ""}{fmt(totalGain)}</span>
            <span className="hd-sub">{gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%</span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted sm">Loading live prices…</p>
      ) : data.length === 0 ? (
        <p className="muted empty sm">No investments yet — add stocks in the Accounts tab.</p>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="ticker" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} width={48} fontSize={12} tickFormatter={fmt0} />
            <Tooltip
              formatter={(v, n) => [fmt(v), n === "invested" ? "Invested" : "Value"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Bar dataKey="invested" name="invested" fill="var(--border)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="value" name="value" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.value >= d.invested ? "var(--green)" : "var(--red)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
