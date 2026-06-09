import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../api.js";
import { netWorthSeries, accountsNetWorth } from "../timeseries.js";
import GranularityTabs from "./GranularityTabs.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function NetWorthWidget({ txns }) {
  const [gran, setGran] = useState("month");
  const [mode, setMode] = useState("transactions"); // transactions | accounts
  const [accounts, setAccounts] = useState([]);

  async function loadAccounts() {
    try {
      setAccounts(await api.listAccounts());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    loadAccounts();
  }, []);

  const netWorthNow = useMemo(() => accountsNetWorth(accounts), [accounts]);
  const anchor = mode === "accounts" && accounts.length ? netWorthNow : null;
  const series = useMemo(
    () => netWorthSeries(txns, gran, anchor),
    [txns, gran, anchor]
  );
  const current = series.length ? series[series.length - 1].value : anchor || 0;

  return (
    <section className="card widget widget-lg">
      <div className="widget-head">
        <div>
          <span className="muted">Net worth</span>
          <div className={`widget-value ${current >= 0 ? "pos" : "neg"}`}>{fmtFull(current)}</div>
        </div>
        <div className="widget-controls">
          <div className="seg">
            <button
              className={`seg-btn ${mode === "transactions" ? "seg-on" : ""}`}
              onClick={() => setMode("transactions")}
              title="Cumulative balance from your transactions"
            >
              Cumulative
            </button>
            <button
              className={`seg-btn ${mode === "accounts" ? "seg-on" : ""}`}
              onClick={() => setMode("accounts")}
              title="Anchored to your real account balances"
            >
              Accounts
            </button>
          </div>
          <GranularityTabs value={gran} onChange={setGran} />
        </div>
      </div>

      {mode === "accounts" && accounts.length === 0 && (
        <p className="muted hint-line">
          Add accounts in the Accounts tab to anchor the curve to your real net worth.
        </p>
      )}

      {series.length === 0 ? (
        <p className="muted empty">No data yet — add transactions to see your balance over time.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} width={52} fontSize={12} tickFormatter={fmt} />
            <Tooltip
              formatter={(v) => [fmtFull(v), "Net worth"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
