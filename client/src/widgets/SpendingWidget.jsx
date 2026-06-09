import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { spendingSeries, bucketKey, periodLabel } from "../timeseries.js";
import { shortenMerchant } from "../merchant.js";
import GranularityTabs from "./GranularityTabs.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function SpendingWidget({ txns }) {
  const [gran, setGran] = useState("month");
  const [selected, setSelected] = useState(null); // a period key, e.g. "2026-05-07"

  const series = useMemo(() => spendingSeries(txns, gran), [txns, gran]);
  const total = useMemo(() => series.reduce((s, p) => s + p.value, 0), [series]);
  const avg = series.length ? total / series.length : 0;

  function changeGran(g) {
    setGran(g);
    setSelected(null);
  }

  // Close the drill-down popup on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Clicking a bar selects that period (toggles off if clicked again).
  function pickBar(state) {
    const p = state?.activePayload?.[0]?.payload;
    if (p) setSelected((cur) => (cur === p.period ? null : p.period));
  }

  const drill = useMemo(() => {
    if (!selected) return [];
    return txns
      .filter((t) => t.type === "expense" && bucketKey(t.date, gran) === selected)
      .sort((a, b) => b.amount - a.amount);
  }, [txns, gran, selected]);
  const drillTotal = drill.reduce((s, t) => s + t.amount, 0);

  return (
    <section className="card widget widget-lg spend-widget">
      <div className="widget-head">
        <div>
          <span className="muted">Spending</span>
          <div className="widget-value neg">
            {fmtFull(avg)}<span className="muted unit"> avg / {gran}</span>
          </div>
        </div>
        <GranularityTabs value={gran} onChange={changeGran} />
      </div>

      {series.length === 0 ? (
        <p className="muted empty">No spending yet — import or add expenses.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series} margin={{ top: 12, right: 8, left: -8, bottom: 0 }} onClick={pickBar}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} width={52} fontSize={12} tickFormatter={fmt} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                formatter={(v) => [fmtFull(v), "Spending"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Bar dataKey="value" fill="var(--red)" radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
          {!selected && (
            <p className="muted hint-sm">Tip: click a bar to see that period's transactions.</p>
          )}
        </>
      )}

      {selected && (
        <div className="drill-overlay" onClick={() => setSelected(null)}>
          <div className="drill-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="drill-head">
              <div className="drill-title">
                <strong>{periodLabel(selected, gran)}</strong>
                <span className="neg">{fmtFull(drillTotal)}</span>
              </div>
              <button className="drill-close" onClick={() => setSelected(null)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            {drill.length === 0 ? (
              <p className="muted sm">No expenses in this period.</p>
            ) : (
              <ul className="drill-list">
                {drill.map((t) => (
                  <li key={t.id}>
                    <span className="drill-name" title={t.description || t.category}>
                      {t.description ? shortenMerchant(t.description) : t.category}
                    </span>
                    <span className="muted drill-cat">{t.category}</span>
                    <span className="muted drill-date">{t.date.slice(5)}</span>
                    <span className="neg">{fmtFull(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
