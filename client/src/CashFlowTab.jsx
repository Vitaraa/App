import { useEffect, useMemo, useState } from "react";
import { cashFlowSeries } from "./timeseries.js";
import { shortenMerchant } from "./merchant.js";
import { fmt, signed } from "./charts.jsx";

const CAT_COLORS = {
  Income: "#4f9a6a", Salary: "#4f9a6a", Freelance: "#5a93a8", Business: "#5a8a6a", Investments: "#7e7a3c",
  Rental: "#6a9a7a", Groceries: "#7a9a52", Dining: "#cf6b3f", Transport: "#5a8aa8",
  Shopping: "#b06a8c", Subscriptions: "#8a6fae", Utilities: "#9a8048", Housing: "#c0763e",
  Health: "#c06070", Insurance: "#7a8a60", Entertainment: "#8a7a4a", Education: "#6a90ae",
  Transfers: "#6f8a9a", Fees: "#b07a4a", Other: "#a39785",
};
const catColor = (c) => CAT_COLORS[c] ?? "#a39785";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ============================================================
   SANKEY — income → net income → spending / saving
   ============================================================ */
function Sankey({ income, out, drill }) {
  const W = 1000, H = 440;
  const nodeW = 15, gap = 16;
  const padL = 122, padR = 156, padT = 30, padB = 30;
  const [hov, setHov] = useState(null);
  const [tip, setTip] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => { setSel(null); setHov(null); setTip(null); }, [income, out]);

  const total = income.reduce((s, n) => s + n.amt, 0) || 1;
  const x0 = padL, x2 = W - padR - nodeW, x1 = (x0 + x2) / 2 - nodeW / 2;
  const maxCount = Math.max(income.length, out.length, 1);
  const availH = H - padT - padB - (maxCount - 1) * gap;
  const scale = availH / total;

  const layout = (nodes, x) => {
    const colH = nodes.reduce((s, n) => s + n.amt * scale, 0) + (nodes.length - 1) * gap;
    let y = padT + (H - padT - padB - colH) / 2;
    return nodes.map((n) => {
      const h = Math.max(2, n.amt * scale);
      const o = { ...n, x, y, h, cx: x + nodeW / 2, mid: y + h / 2 };
      y += h + gap;
      return o;
    });
  };

  const inc = layout(income, x0);
  const outN = layout(out, x2);
  const hubH = total * scale;
  const hubY = padT + (H - padT - padB - hubH) / 2;
  const hub = { x: x1, y: hubY, h: hubH, cx: x1 + nodeW / 2 };

  const links = [];
  let hubIn = hubY;
  inc.forEach((n) => {
    const h = n.amt * scale;
    links.push({ key: "i-" + n.name, color: n.color, value: n.amt, label: n.name + " → Net income",
      sx: n.x + nodeW, sy0: n.y, sy1: n.y + h, tx: hub.x, ty0: hubIn, ty1: hubIn + h });
    hubIn += h;
  });
  let hubOut = hubY;
  outN.forEach((n) => {
    const h = n.amt * scale;
    links.push({ key: "o-" + n.name, color: n.color, value: n.amt, label: "Net income → " + n.name,
      sx: hub.x + nodeW, sy0: hubOut, sy1: hubOut + h, tx: n.x, ty0: n.y, ty1: n.y + h });
    hubOut += h;
  });

  const pick = (name) => {
    const s = income.find((n) => n.name === name);
    if (s) return { name, amt: s.amt, color: s.color, kind: "income" };
    const o = out.find((n) => n.name === name);
    return o ? { name, amt: o.amt, color: o.color, kind: o.kind } : null;
  };
  const toggle = (name) => { setHov(null); setTip(null); setSel((cur) => (cur && cur.name === name ? null : pick(name))); };
  const toggleHub = () => { setHov(null); setTip(null); setSel((cur) => (cur && cur.kind === "hub" ? null : { name: "Net income", kind: "hub", amt: total, color: "var(--accent)" })); };

  const ribbon = (l) => {
    const mx = (l.sx + l.tx) / 2;
    return `M${l.sx},${l.sy0} C${mx},${l.sy0} ${mx},${l.ty0} ${l.tx},${l.ty0} L${l.tx},${l.ty1} C${mx},${l.ty1} ${mx},${l.sy1} ${l.sx},${l.sy1} Z`;
  };
  const txt = (s, x, y, anchor, fill, size, weight) => (
    <text x={x} y={y} textAnchor={anchor} fill={fill} fontSize={size} fontWeight={weight} style={{ fontVariantNumeric: "tabular-nums" }}>{s}</text>
  );

  return (
    <div className="sankey-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cash flow Sankey" onMouseLeave={() => { setHov(null); setTip(null); }}>
        {links.map((l, i) => {
          const rel = sel ? (sel.kind === "hub" ? true : sel.kind === "income" ? l.key === "i-" + sel.name : l.key === "o-" + sel.name) : null;
          const op = sel ? (rel ? 0.6 : 0.05) : hov == null ? 0.28 : hov === i ? 0.6 : 0.07;
          return (
            <path key={l.key} className="sk-flow" d={ribbon(l)} fill={l.color} fillOpacity={op}
              onMouseEnter={() => { if (!sel) { setHov(i); setTip({ x: (l.sx + l.tx) / 2, y: (l.ty0 + l.ty1) / 2, ...l }); } }}
              onClick={() => toggle(l.key.slice(2))} />
          );
        })}
        {inc.map((n) => <rect key={n.name} className="sk-node" x={n.x} y={n.y} width={nodeW} height={n.h} rx="3" fill={n.color}
          stroke={sel && sel.name === n.name ? "var(--text)" : "none"} strokeWidth="2" style={{ cursor: "pointer" }} onClick={() => toggle(n.name)} />)}
        <rect className="sk-node" x={hub.x} y={hub.y} width={nodeW} height={hub.h} rx="3" fill="var(--accent)"
          stroke={sel && sel.kind === "hub" ? "var(--text)" : "none"} strokeWidth="2" style={{ cursor: "pointer" }} onClick={toggleHub} />
        {outN.map((n) => <rect key={n.name} className="sk-node" x={n.x} y={n.y} width={nodeW} height={n.h} rx="3" fill={n.color}
          stroke={sel && sel.name === n.name ? "var(--text)" : "none"} strokeWidth="2" style={{ cursor: "pointer" }} onClick={() => toggle(n.name)} />)}

        {inc.map((n) => (
          <g key={n.name} style={{ cursor: "pointer" }} onClick={() => toggle(n.name)}>
            {txt(n.name, n.x - 12, n.mid - 2, "end", "var(--text)", 13.5, 600)}
            {txt(fmt(n.amt, 0), n.x - 12, n.mid + 13, "end", "var(--muted)", 12, 500)}
          </g>
        ))}
        {txt("Net income", hub.cx, hub.y - 22, "middle", "var(--text)", 14, 700)}
        {txt(fmt(total, 0), hub.cx, hub.y - 6, "middle", "var(--accent)", 13, 700)}
        {outN.map((n) => (
          <g key={n.name} style={{ cursor: "pointer" }} onClick={() => toggle(n.name)}>
            {txt(n.name, n.x + nodeW + 12, n.mid - 2, "start", "var(--text)", 13.5, 600)}
            {txt(fmt(n.amt, 0), n.x + nodeW + 12, n.mid + 13, "start", n.kind === "save" ? "var(--green)" : "var(--muted)", 12, 500)}
          </g>
        ))}
      </svg>

      {!sel && tip && (
        <div className="sk-tip" style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` }}>
          <div className="skt-flow">{tip.label}</div>
          <div className="skt-val">{fmt(tip.value, 0)}</div>
        </div>
      )}

      {sel && (() => {
        const side = sel.kind === "income" || sel.kind === "hub" ? "left" : "right";
        const isCredit = sel.kind !== "spend";
        const amtColor = isCredit ? "var(--green)" : "var(--text)";
        const kindLabel = sel.kind === "hub" ? "All sources" : sel.kind === "income" ? "Income" : sel.kind === "save" ? "Saved" : "Spending";
        const rows = sel.kind === "hub"
          ? income.map((n) => ({ payee: n.name, memo: "Net income", amt: n.amt, date: "" }))
          : drill(sel);
        const foot = sel.kind === "spend" ? "Debits this period" : sel.kind === "hub" ? "Money in, before it flowed back out" : sel.kind === "save" ? "Surplus kept this period" : "Deposits this period";
        return (
          <div className={"sk-detail " + side}>
            <div className="skd-head">
              <span className="skd-dot" style={{ background: sel.color || "var(--accent)" }} />
              <div className="skd-headtext">
                <div className="skd-title">{sel.name}</div>
                <div className="skd-sub">{kindLabel + " · " + rows.length + " " + (sel.kind === "hub" ? "sources" : "transactions")}</div>
              </div>
              <div className="skd-total" style={{ color: amtColor }}>{fmt(sel.amt, 0)}</div>
              <button className="skd-close" onClick={() => setSel(null)} aria-label="Close">×</button>
            </div>
            <div className="skd-list">
              {rows.length === 0 && <div className="skd-row"><div className="skd-rowtext"><div className="skd-memo">No line items.</div></div></div>}
              {rows.map((r, i) => (
                <div className="skd-row" key={i}>
                  <div className="skd-rowtext">
                    <div className="skd-payee">{r.payee}</div>
                    <div className="skd-memo">{r.memo}{r.date ? " · " + r.date : ""}</div>
                  </div>
                  <div className="skd-amt" style={{ color: amtColor }}>{fmt(r.amt, 0)}</div>
                </div>
              ))}
            </div>
            <div className="skd-foot">{foot}</div>
          </div>
        );
      })()}
    </div>
  );
}

/* ============================================================
   CASH FLOW TREND — 12-month grouped bars + net line
   ============================================================ */
function CashFlowTrend({ data }) {
  const W = 940, H = 240, padL = 46, padR = 14, padT = 18, padB = 30;
  const [hov, setHov] = useState(null);
  const max = Math.max(...data.flatMap((d) => [d.in, d.out]), 1);
  const niceMax = Math.ceil(max / 1000) * 1000 || 1000;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const groupW = innerW / data.length;
  const bw = Math.min(15, groupW / 3.4);
  const yOf = (v) => padT + innerH - (v / niceMax) * innerH;
  const kf = (v) => "$" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k";
  const ticks = [0, niceMax / 2, niceMax];
  const netPts = data.map((d, i) => [padL + i * groupW + groupW / 2, yOf(d.in - d.out)]);
  const netPath = netPts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  return (
    <div className="cft-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="12-month cash flow" onMouseLeave={() => setHov(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
            <text x={padL - 10} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{kf(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + i * groupW + groupW / 2;
          const inH = (d.in / niceMax) * innerH, outH = (d.out / niceMax) * innerH;
          const on = hov === i;
          return (
            <g key={i} onMouseEnter={() => setHov(i)}>
              <rect x={cx - groupW / 2} y={padT} width={groupW} height={innerH} fill={on ? "var(--hover)" : "transparent"} />
              <rect x={cx - bw - 1.5} y={padT + innerH - inH} width={bw} height={inH} rx="3" fill="var(--accent)" opacity={hov == null || on ? 1 : 0.4} />
              <rect x={cx + 1.5} y={padT + innerH - outH} width={bw} height={outH} rx="3" fill="var(--red)" opacity={hov == null || on ? 0.92 : 0.35} />
              <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.m}</text>
            </g>
          );
        })}
        <path d={netPath} fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 5" />
        {netPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={hov === i ? 4 : 2.6} fill="var(--green)" />)}
        {hov != null && (() => {
          const px = netPts[hov][0], py = netPts[hov][1];
          const label = signed(data[hov].in - data[hov].out, 0);
          const w = label.length * 7.3 + 18, h = 21;
          let bx = Math.max(padL, Math.min(px - w / 2, W - padR - w));
          let by = py - h - 9, below = false;
          if (by < padT + 2) { by = py + 9; below = true; }
          const tipX = Math.max(bx + 9, Math.min(px, bx + w - 9));
          return (
            <g style={{ pointerEvents: "none" }}>
              <line x1={px} y1={py} x2={tipX} y2={below ? by : by + h} stroke="var(--green)" strokeWidth="1" strokeOpacity="0.45" />
              <rect x={bx} y={by} width={w} height={h} rx="6" fill="var(--card)" stroke="var(--green)" strokeOpacity="0.55" />
              <text x={bx + w / 2} y={by + h / 2 + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--green)" style={{ fontVariantNumeric: "tabular-nums" }}>{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ============================================================
   CASH FLOW PAGE
   ============================================================ */
export default function CashFlowTab({ txns }) {
  const months = useMemo(() => {
    const set = new Set(txns.map((t) => String(t.date).slice(0, 7)));
    return [...set].sort().reverse();
  }, [txns]);

  const periodOptions = useMemo(() => {
    const opts = [];
    if (months[0]) opts.push({ value: months[0], label: "This month" });
    if (months[1]) opts.push({ value: months[1], label: "Last month" });
    opts.push({ value: "__3mo", label: "3-mo avg" });
    return opts;
  }, [months]);

  const [period, setPeriod] = useState(months[0] ?? "__3mo");
  useEffect(() => { if (!months.includes(period) && period !== "__3mo") setPeriod(months[0] ?? "__3mo"); }, [months]); // eslint-disable-line

  // Transactions in the selected period.
  const periodTxns = useMemo(() => {
    if (period === "__3mo") {
      const keep = months.slice(0, 3);
      return txns.filter((t) => keep.includes(String(t.date).slice(0, 7)));
    }
    return txns.filter((t) => String(t.date).slice(0, 7) === period);
  }, [txns, period, months]);

  const divisor = period === "__3mo" ? Math.max(1, Math.min(3, months.length)) : 1;

  // Build income / out nodes from real data.
  const { income, out, totalIn, spend, save } = useMemo(() => {
    const incMap = {}, outMap = {};
    periodTxns.forEach((t) => {
      if (t.type === "income") incMap[t.category] = (incMap[t.category] ?? 0) + t.amount;
      else outMap[t.category] = (outMap[t.category] ?? 0) + t.amount;
    });
    const income = Object.entries(incMap).map(([name, amt]) => ({ name, amt: amt / divisor, color: catColor(name), kind: "income" }))
      .sort((a, b) => b.amt - a.amt);
    const totalIn = income.reduce((s, n) => s + n.amt, 0);
    const spendNodes = Object.entries(outMap).map(([name, amt]) => ({ name, amt: amt / divisor, color: catColor(name), kind: "spend" }))
      .sort((a, b) => b.amt - a.amt);
    const spend = spendNodes.reduce((s, n) => s + n.amt, 0);
    const surplus = totalIn - spend;
    const out = [...spendNodes];
    if (surplus > 0.5) out.push({ name: "Savings", amt: surplus, color: "#4f9a6a", kind: "save" });
    return { income, out, totalIn, spend, save: Math.max(0, surplus) };
  }, [periodTxns, divisor]);

  const rate = totalIn > 0 ? Math.round((save / totalIn) * 100) : 0;

  // Drill-down: real transactions behind a node.
  const drill = (sel) => {
    if (sel.kind === "save") return [{ payee: "Net surplus", memo: "Income minus spending", amt: Math.round(sel.amt), date: "" }];
    const wantIncome = sel.kind === "income";
    return periodTxns
      .filter((t) => (wantIncome ? t.type === "income" : t.type !== "income") && t.category === sel.name)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12)
      .map((t) => ({
        payee: t.description ? shortenMerchant(t.description) : t.category,
        memo: t.account_name || t.category,
        amt: Math.round(t.amount / divisor),
        date: t.date,
      }));
  };

  // 12-month trend.
  const trend = useMemo(() => {
    const series = cashFlowSeries(txns, "month").slice(-12);
    return series.map((s) => {
      const [, m] = s.period.split("-");
      return { m: MONTHS[Number(m) - 1], in: s.income, out: s.expense };
    });
  }, [txns]);

  if (txns.length === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Cash Flow</h1></div></div>
        <p className="muted" style={{ padding: "20px 0" }}>No transactions yet — import a statement to see your money flow.</p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cash Flow</h1>
          <p className="page-sub">Trace where every dollar comes from and where it goes.</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="card">
        <div className="kpi-row">
          <div className="kpi">
            <span className="kpi-label">Money in</span>
            <span className="kpi-val pos">{fmt(totalIn, 0)}</span>
            <span className="kpi-delta muted">{income.length} source{income.length === 1 ? "" : "s"}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Money out</span>
            <span className="kpi-val neg">{fmt(spend, 0)}</span>
            <span className="kpi-delta muted">across {out.filter((o) => o.kind === "spend").length} categories</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Net saved</span>
            <span className={"kpi-val " + (save >= 0 ? "pos" : "neg")}>{signed(save, 0)}</span>
            <span className="kpi-delta muted">surplus kept</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Savings rate</span>
            <span className="kpi-val">{rate}%</span>
            <span className="kpi-delta muted">of income kept</span>
          </div>
        </div>
      </div>

      {/* Sankey */}
      <div className="card widget">
        <div className="cf-hero-head">
          <div>
            <span className="widget-eyebrow">Money flow</span>
            <div className="widget-title" style={{ fontSize: "var(--text-h2)", marginTop: 4 }}>Where every dollar went</div>
          </div>
          <div className="cf-hero-right">
            <div className="sk-legend">
              <span className="sk-leg"><span className="sw" style={{ background: "var(--accent)" }} />Spending</span>
              <span className="sk-leg"><span className="sw" style={{ background: "var(--green)" }} />Saved</span>
            </div>
            <div className="seg">
              {periodOptions.map((o) => (
                <button key={o.value} className={"seg-btn" + (period === o.value ? " seg-on" : "")} onClick={() => setPeriod(o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        {income.length === 0 && out.length === 0 ? (
          <p className="muted" style={{ padding: "30px 0", textAlign: "center" }}>No activity in this period.</p>
        ) : (
          <Sankey income={income} out={out} drill={drill} />
        )}
        <div className="sk-cap">Tip: hover any flow to trace a dollar from its source — or click a band to see the transactions behind it.</div>
      </div>

      {/* 12-month trend */}
      <div className="card widget">
        <div className="widget-head">
          <span className="widget-title">12-month cash flow</span>
          <div className="cf-legend">
            <span className="cf-leg"><span className="sw" style={{ background: "var(--accent)" }} />In</span>
            <span className="cf-leg"><span className="sw" style={{ background: "var(--red)" }} />Out</span>
            <span className="cf-leg"><span className="sw" style={{ background: "var(--green)", borderRadius: 999, width: 10, height: 10 }} />Net</span>
          </div>
        </div>
        {trend.length > 0 ? <CashFlowTrend data={trend} /> : <p className="muted">Not enough history yet.</p>}
      </div>
    </>
  );
}
