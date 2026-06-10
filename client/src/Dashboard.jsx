import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import logo from "./logo.svg";
import Transactions from "./Transactions.jsx";
import AccountsTab from "./AccountsTab.jsx";
import NetWorthWidget from "./widgets/NetWorthWidget.jsx";
import SpendingWidget from "./widgets/SpendingWidget.jsx";
import InvestmentsWidget from "./widgets/InvestmentsWidget.jsx";
import GoalsWidget from "./widgets/GoalsWidget.jsx";
import SubscriptionsWidget from "./widgets/SubscriptionsWidget.jsx";

export default function Dashboard() {
  const { username, logout } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  async function load() {
    try {
      setTxns(await api.listTransactions());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page page-wide">
      <header className="topbar">
        <h1 className="brand">
          <img src={logo} className="brand-logo" alt="" />
          Claud
        </h1>
        <div className="user">
          <span className="muted">{username}</span>
          <button className="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === "overview" ? "tab-on" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${tab === "transactions" ? "tab-on" : ""}`}
          onClick={() => setTab("transactions")}
        >
          Transactions
        </button>
        <button
          className={`tab ${tab === "accounts" ? "tab-on" : ""}`}
          onClick={() => setTab("accounts")}
        >
          Accounts
        </button>
      </nav>

      {error && <div className="error">{error}</div>}

      {tab === "transactions" ? (
        <Transactions txns={txns} reload={load} />
      ) : tab === "accounts" ? (
        <AccountsTab />
      ) : (
        <>
          <div className="dash-grid dash-large">
            <NetWorthWidget txns={txns} />
            <SpendingWidget txns={txns} />
          </div>
          <div className="dash-grid dash-medium">
            <InvestmentsWidget />
            <GoalsWidget />
            <SubscriptionsWidget txns={txns} />
          </div>
        </>
      )}
    </div>
  );
}
