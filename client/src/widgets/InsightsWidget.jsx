import { useMemo } from "react";
import { computeInsights } from "../insights.js";

export default function InsightsWidget({ txns }) {
  const insights = useMemo(() => computeInsights(txns), [txns]);
  return (
    <section className="card widget insight-box">
      <div className="widget-head">
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
  );
}
