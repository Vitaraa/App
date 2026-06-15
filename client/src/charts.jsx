import { useState } from "react";

export const fmt = (n, d = 0) =>
  Number(n).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: d });
export const signed = (n, d = 0) => (n >= 0 ? "+" : "−") + fmt(Math.abs(n), d);

export function cardinalSpline(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/* Net worth line + area chart with hover crosshair. */
export function NetWorthChart({ data, labels, gradId = "nwFill", lineId = "nwLine" }) {
  const W = 660, H = 210, padL = 6, padR = 6, padT = 16, padB = 22;
  const [hover, setHover] = useState(null);
  if (!data.length) return null;

  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const pts = data.map((v, i) => ({
    x: padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: padT + innerH - ((v - min) / span) * innerH,
    v, label: labels[i],
  }));

  const zeroY = padT + innerH - ((0 - min) / span) * innerH;
  const splitOff = Math.max(0, Math.min(1, (zeroY - padT) / innerH));
  const lastNeg = data[data.length - 1] < 0;
  const path = cardinalSpline(pts);
  const area = path ? path + ` L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z` : "";
  const grid = [0, 0.5, 1].map((f) => padT + innerH - f * innerH);
  const hp = hover != null ? pts[hover] : null;

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1={padT} x2="0" y2={padT + innerH} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.26" />
            <stop offset={splitOff} stopColor="var(--accent)" stopOpacity="0.02" />
            <stop offset={splitOff} stopColor="var(--red)" stopOpacity="0.05" />
            <stop offset="1" stopColor="var(--red)" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id={lineId} x1="0" y1={padT} x2="0" y2={padT + innerH} gradientUnits="userSpaceOnUse">
            <stop offset={splitOff} stopColor="var(--accent)" />
            <stop offset={splitOff} stopColor="var(--red)" />
          </linearGradient>
        </defs>
        {grid.map((y, i) => (
          <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
        ))}
        {area && <path d={area} fill={`url(#${gradId})`} />}
        {path && <path d={path} fill="none" stroke={`url(#${lineId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
        {hp && <line x1={hp.x} y1={padT - 6} x2={hp.x} y2={padT + innerH} stroke="var(--accent-line)" strokeWidth="1" strokeDasharray="3 3" />}
        {hp && <circle cx={hp.x} cy={hp.y} r="4.5" fill="var(--card)" stroke={hp.v < 0 ? "var(--red)" : "var(--accent)"} strokeWidth="2.4" />}
        {!hp && <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill={lastNeg ? "var(--red)" : "var(--accent)"} />}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%` }}>
          <div className="tip-date">{hp.label}</div>
          <div className="tip-val">{fmt(hp.v)}</div>
        </div>
      )}
    </div>
  );
}

/* Tiny trend sparkline for account rows. */
export function Sparkline({ data }) {
  const W = 92, H = 30, p = 3;
  if (!data || data.length < 2) return <div className="acct-spark" />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (W - 2 * p);
    const y = p + (H - 2 * p) - ((v - min) / span) * (H - 2 * p);
    return [x, y];
  });
  const d = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const up = data[data.length - 1] >= data[0];
  const col = up ? "var(--green)" : "var(--red)";
  return (
    <div className="acct-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={col} />
      </svg>
    </div>
  );
}

/* 6-month grouped in/out bars. */
export function CashFlowBars({ data }) {
  const W = 340, H = 150, padB = 22, padT = 8;
  const max = Math.max(...data.flatMap((d) => [d.in, d.out]), 1);
  const innerH = H - padB - padT;
  const groupW = W / data.length;
  const bw = 13, gap = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} aria-hidden="true">
      {data.map((d, i) => {
        const cx = i * groupW + groupW / 2;
        const inH = (d.in / max) * innerH;
        const outH = (d.out / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw - gap / 2} y={padT + innerH - inH} width={bw} height={inH} rx="3" fill="var(--accent)" />
            <rect x={cx + gap / 2} y={padT + innerH - outH} width={bw} height={outH} rx="3" fill="var(--red)" opacity="0.85" />
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{d.m}</text>
          </g>
        );
      })}
    </svg>
  );
}
