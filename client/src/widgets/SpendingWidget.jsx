import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { spendingSeries } from "../timeseries.js";
import GranularityTabs from "./GranularityTabs.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function SpendingWidget({ txns }) {
  const [gran, setGran] = useState("month");
  const series = useMemo(() => spendingSeries(txns, gran), [txns, gran]);
  const total = useMemo(() => series.reduce((s, p) => s + p.value, 0), [series]);
  const avg = series.length ? total / series.length : 0;

  return (
    <section className="card widget widget-lg">
      <div className="widget-head">
        <div>
          <span className="muted">Spending</span>
          <div className="widget-value neg">{fmtFull(avg)}<span className="muted unit"> avg / {gran}</span></div>
        </div>
        <GranularityTabs value={gran} onChange={setGran} />
      </div>
      {series.length === 0 ? (
        <p className="muted empty">No spending yet — import or add expenses.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={series} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} width={52} fontSize={12} tickFormatter={fmt} />
            <Tooltip
              formatter={(v) => [fmtFull(v), "Spending"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Bar dataKey="value" fill="var(--red)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
