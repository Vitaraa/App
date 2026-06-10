import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { cashFlowSeries } from "./timeseries.js";
import GranularityTabs from "./widgets/GranularityTabs.jsx";

const fmt0 = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function CashFlowTab({ txns }) {
  const [gran, setGran] = useState("month");
  const series = useMemo(() => cashFlowSeries(txns, gran), [txns, gran]);

  const totals = useMemo(() => {
    const income = series.reduce((s, p) => s + p.income, 0);
    const expense = series.reduce((s, p) => s + p.expense, 0);
    return { income, expense, net: income - expense };
  }, [series]);

  return (
    <div className="cashflow-tab">
      <section className="stats">
        <div className="card stat">
          <span className="muted">Money in</span>
          <strong className="pos">{fmt(totals.income)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Money out</span>
          <strong className="neg">{fmt(totals.expense)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Net cash flow</span>
          <strong className={totals.net >= 0 ? "pos" : "neg"}>{fmt(totals.net)}</strong>
        </div>
      </section>

      <section className="card chart-card">
        <div className="widget-head">
          <span className="muted">Income vs expense</span>
          <GranularityTabs value={gran} onChange={setGran} />
        </div>
        {series.length === 0 ? (
          <p className="muted empty">No transactions yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={series} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} width={56} fontSize={12} tickFormatter={fmt0} />
              <Tooltip
                formatter={(v, n) => [fmt(v), n[0].toUpperCase() + n.slice(1)]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" fill="var(--green)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="var(--red)" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="net" name="Net" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
