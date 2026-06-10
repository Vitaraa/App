import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "../api.js";

const fmt0 = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (d) => {
  const [y, m] = String(d).split("-");
  return `${MONTHS[Number(m) - 1]} ${String(y).slice(2)}`;
};

export default function InvestmentsWidget() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const s = await api.investmentHistory();
      setSeries(s.map((p) => ({ ...p, label: label(p.date) })));
    } catch {
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const { totalValue, totalCost, totalGain, gainPct } = useMemo(() => {
    const last = series[series.length - 1];
    const totalValue = last ? last.value : 0;
    const totalCost = last ? last.cost : 0;
    const totalGain = totalValue - totalCost;
    return { totalValue, totalCost, totalGain, gainPct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0 };
  }, [series]);

  return (
    <section className="card widget widget-md">
      <div className="widget-head">
        <div>
          <span className="muted">Investments</span>
          <div className="widget-value">{fmt(totalValue)}</div>
        </div>
        {series.length > 0 && (
          <div className={`invest-gain ${totalGain >= 0 ? "pos" : "neg"}`}>
            <span>{totalGain >= 0 ? "+" : ""}{fmt(totalGain)}</span>
            <span className="hd-sub">{gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%</span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted sm">Loading live prices…</p>
      ) : series.length === 0 ? (
        <p className="muted empty sm">No investments yet — add stocks in the Accounts tab.</p>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={20} />
            <YAxis tickLine={false} axisLine={false} width={48} fontSize={12} tickFormatter={fmt0} />
            <Tooltip
              formatter={(v, n) => [v == null ? "—" : fmt(v), n]}
              labelFormatter={(l) => l}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="value"
              name="Portfolio"
              stroke={totalGain >= 0 ? "var(--green)" : "var(--red)"}
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="spx"
              name="S&P 500"
              stroke="var(--muted)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
