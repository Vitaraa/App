import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./ds.jsx";
import { cardinalSpline, fmt } from "./charts.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d) => {
  const [y, m] = String(d).split("-");
  return `${MONTHS[Number(m) - 1]} ${String(y).slice(2)}`;
};
const ALLOC_COLORS = ["#cf7846", "#5a93a8", "#7a9a52", "#b06a8c", "#8a6fae", "#9a8048", "#4f9a6a", "#c06070", "#6a90ae", "#a39785"];

/* Portfolio vs S&P — two normalized % lines with hover. */
function ComparisonChart({ series }) {
  const W = 940, H = 240, padL = 44, padR = 14, padT = 18, padB = 26;
  const [hover, setHover] = useState(null);

  const pts = series.filter((p) => p.value != null);
  if (pts.length < 2) return <p className="muted" style={{ padding: "20px 0" }}>Not enough history yet.</p>;

  const base = pts[0];
  const spxBase = pts.find((p) => p.spx != null)?.spx;
  const portRet = pts.map((p) => (base.value ? ((p.value - base.value) / base.value) * 100 : 0));
  const spxRet = pts.map((p) => (spxBase && p.spx != null ? ((p.spx - spxBase) / spxBase) * 100 : null));

  const all = [...portRet, ...spxRet.filter((v) => v != null)];
  const min = Math.min(...all, 0), max = Math.max(...all, 0);
  const span = max - min || 1;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xOf = (i) => padL + (i / (pts.length - 1)) * innerW;
  const yOf = (v) => padT + innerH - ((v - min) / span) * innerH;

  const portXY = portRet.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const spxXY = spxRet.map((v, i) => (v == null ? null : { x: xOf(i), y: yOf(v) })).filter(Boolean);
  const zeroY = yOf(0);

  const hp = hover != null ? hover : pts.length - 1;

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    portXY.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" fontSize="11" fill="var(--muted)">0%</text>
        <path d={cardinalSpline(spxXY)} fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.8" />
        <path d={cardinalSpline(portXY)} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => i % Math.ceil(pts.length / 8) === 0 && (
          <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{monthLabel(p.date)}</text>
        ))}
        <line x1={portXY[hp].x} y1={padT} x2={portXY[hp].x} y2={padT + innerH} stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={portXY[hp].x} cy={portXY[hp].y} r="4" fill="var(--card)" stroke="var(--accent)" strokeWidth="2.2" />
      </svg>
      <div className="cmp-readout">
        <span className="cmp-chip"><span className="cmp-dot" style={{ background: "var(--accent)" }} />Portfolio <b className={portRet[hp] >= 0 ? "pos" : "neg"}>{portRet[hp] >= 0 ? "+" : ""}{portRet[hp].toFixed(1)}%</b></span>
        {spxRet[hp] != null && <span className="cmp-chip"><span className="cmp-dot" style={{ background: "var(--muted)" }} />S&amp;P 500 <b className={spxRet[hp] >= 0 ? "pos" : "neg"}>{spxRet[hp] >= 0 ? "+" : ""}{spxRet[hp].toFixed(1)}%</b></span>}
        <span className="muted" style={{ fontSize: "var(--text-2xs)" }}>{monthLabel(pts[hp].date)}</span>
      </div>
    </div>
  );
}

export default function InvestmentsTab() {
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [h, hist] = await Promise.all([api.listAllHoldings(), api.investmentHistory()]);
      setHoldings(h);
      setHistory(hist.map((p) => ({ ...p })));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    let value = 0, cost = 0;
    for (const h of holdings) { value += Number(h.marketValue || 0); cost += Number(h.costBasis || 0); }
    return { value, cost, gain: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  }, [holdings]);

  const vsSP = useMemo(() => {
    const spx = history.map((p) => p.spx).filter((v) => v != null);
    if (spx.length < 2) return null;
    const spReturn = ((spx[spx.length - 1] - spx[0]) / spx[0]) * 100;
    return { spReturn, diff: totals.pct - spReturn };
  }, [history, totals.pct]);

  const allocation = useMemo(() => {
    const total = totals.value || 1;
    return [...holdings]
      .sort((a, b) => Number(b.marketValue || 0) - Number(a.marketValue || 0))
      .map((h, i) => ({ ticker: h.ticker, value: Number(h.marketValue || 0), pct: (Number(h.marketValue || 0) / total) * 100, color: ALLOC_COLORS[i % ALLOC_COLORS.length] }));
  }, [holdings, totals.value]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Investments</h1>
          <p className="page-sub">{holdings.length} holding{holdings.length === 1 ? "" : "s"} · {fmt(totals.value)}</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="card">
        <div className="kpi-row">
          <div className="kpi">
            <span className="kpi-label"><Icon name="chart" style={{ width: 13, height: 13 }} />Portfolio value</span>
            <span className="kpi-val">{fmt(totals.value, 0)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Invested</span>
            <span className="kpi-val">{fmt(totals.cost, 0)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Total gain</span>
            <span className={"kpi-val " + (totals.gain >= 0 ? "pos" : "neg")}>{totals.gain >= 0 ? "+" : "−"}{fmt(Math.abs(totals.gain), 0)}</span>
            <span className={"kpi-delta " + (totals.pct >= 0 ? "pos" : "neg")}>{totals.pct >= 0 ? "+" : ""}{totals.pct.toFixed(1)}%</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">vs S&amp;P 500</span>
            {vsSP ? (
              <>
                <span className={"kpi-val " + (vsSP.diff >= 0 ? "pos" : "neg")}>{vsSP.diff >= 0 ? "+" : ""}{vsSP.diff.toFixed(1)}%</span>
                <span className="kpi-delta muted">S&amp;P {vsSP.spReturn >= 0 ? "+" : ""}{vsSP.spReturn.toFixed(1)}%</span>
              </>
            ) : <span className="kpi-val muted">—</span>}
          </div>
        </div>
      </div>

      {/* Comparison chart */}
      <div className="card widget">
        <div className="widget-head">
          <span className="widget-title">Performance vs S&amp;P 500</span>
        </div>
        {loading ? <p className="muted" style={{ padding: "20px 0" }}>Loading live prices…</p>
          : history.length === 0 ? <p className="muted" style={{ padding: "20px 0" }}>No investment history yet — add holdings in the Accounts tab.</p>
          : <ComparisonChart series={history} />}
      </div>

      {/* Allocation */}
      {allocation.length > 0 && (
        <div className="card widget">
          <div className="widget-head"><span className="widget-title">Allocation</span></div>
          <div className="alloc-bar">
            {allocation.map((a) => <div key={a.ticker} className="alloc-seg" style={{ width: a.pct + "%", background: a.color }} title={`${a.ticker} · ${a.pct.toFixed(1)}%`} />)}
          </div>
          <div className="alloc-legend">
            {allocation.map((a) => (
              <div className="alloc-leg" key={a.ticker}>
                <span className="al-name"><span className="sw" style={{ background: a.color }} />{a.ticker}</span>
                <span className="al-pct">{a.pct.toFixed(1)}%</span>
                <span className="al-val">{fmt(a.value, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      <div className="card widget">
        <div className="widget-head"><span className="widget-title">Holdings</span></div>
        {loading ? (
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Loading live prices…</p>
        ) : holdings.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>No holdings yet. Add stocks under an investment account in the Accounts tab.</p>
        ) : (
          <>
            <div className="hold-head">
              <span className="hh-name">Holding</span>
              <span className="hh-ret">Gain</span>
              <span className="hh-val">Value</span>
            </div>
            <div className="hold-list">
              {holdings.map((h) => (
                <div className="hold-row" key={h.id}>
                  <span className="hold-mono">{h.ticker}</span>
                  <div className="hold-body">
                    <span className="hold-name">{h.account_name}</span>
                    <span className="hold-meta">
                      {h.quantity} @ {fmt(h.purchase_price, 2)} · now {h.price != null ? fmt(h.price, 2) : "—"}
                    </span>
                  </div>
                  <span className={"hold-ret " + (h.gain >= 0 ? "pos" : "neg")}>
                    {h.gain >= 0 ? "+" : "−"}{Math.abs(h.gainPct).toFixed(1)}%
                  </span>
                  <div className="hold-right">
                    <span className="hold-val">{fmt(h.marketValue, 2)}</span>
                    <span className={"hold-day " + (h.gain >= 0 ? "pos" : "neg")}>{h.gain >= 0 ? "+" : "−"}{fmt(Math.abs(h.gain), 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
