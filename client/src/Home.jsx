import { Fragment, useEffect, useRef, useState } from "react";
import PageActions from "./PageActions.jsx";
import NetWorthWidget from "./widgets/NetWorthWidget.jsx";
import SpendingWidget from "./widgets/SpendingWidget.jsx";
import InvestmentsWidget from "./widgets/InvestmentsWidget.jsx";
import GoalsWidget from "./widgets/GoalsWidget.jsx";
import SubscriptionsWidget from "./widgets/SubscriptionsWidget.jsx";
import InsightsWidget from "./widgets/InsightsWidget.jsx";

const WIDGETS = [
  { key: "networth", label: "Net worth", size: "large" },
  { key: "spending", label: "Spending", size: "large" },
  { key: "investments", label: "Investments", size: "medium" },
  { key: "goals", label: "Savings goals", size: "medium" },
  { key: "subscriptions", label: "Recurring", size: "medium" },
  { key: "insights", label: "Insights", size: "medium" },
];
const DEFAULTS = Object.fromEntries(WIDGETS.map((w) => [w.key, true]));

export default function Home({ txns }) {
  const [vis, setVis] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("claud_widgets") || "{}") };
    } catch {
      return DEFAULTS;
    }
  });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    localStorage.setItem("claud_widgets", JSON.stringify(vis));
  }, [vis]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = (k) => setVis((v) => ({ ...v, [k]: !v[k] }));

  const comp = {
    networth: () => <NetWorthWidget txns={txns} />,
    spending: () => <SpendingWidget txns={txns} />,
    investments: () => <InvestmentsWidget />,
    goals: () => <GoalsWidget />,
    subscriptions: () => <SubscriptionsWidget txns={txns} />,
    insights: () => <InsightsWidget txns={txns} />,
  };
  const large = WIDGETS.filter((w) => w.size === "large" && vis[w.key]);
  const medium = WIDGETS.filter((w) => w.size === "medium" && vis[w.key]);

  return (
    <>
      <PageActions>
        <div className="customize" ref={ref}>
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            Customize
          </button>
          {open && (
            <div className="customize-menu">
              <span className="customize-title muted">Show widgets</span>
              {WIDGETS.map((w) => (
                <label key={w.key} className="customize-item">
                  <input type="checkbox" checked={!!vis[w.key]} onChange={() => toggle(w.key)} />
                  <span>{w.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </PageActions>

      {large.length > 0 && (
        <div className="dash-grid dash-large">
          {large.map((w) => (
            <Fragment key={w.key}>{comp[w.key]()}</Fragment>
          ))}
        </div>
      )}
      {medium.length > 0 && (
        <div className="dash-grid dash-medium">
          {medium.map((w) => (
            <Fragment key={w.key}>{comp[w.key]()}</Fragment>
          ))}
        </div>
      )}
    </>
  );
}
