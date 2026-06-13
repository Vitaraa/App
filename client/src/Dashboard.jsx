import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import logo from "./logo.svg";
import Home from "./Home.jsx";
import AccountsTab from "./AccountsTab.jsx";
import Transactions from "./Transactions.jsx";
import CashFlowTab from "./CashFlowTab.jsx";
import BudgetTab from "./BudgetTab.jsx";
import InvestmentsTab from "./InvestmentsTab.jsx";
import ForesightTab from "./ForesightTab.jsx";

const TABS = [
  ["dashboard", "Dashboard"],
  ["accounts", "Accounts"],
  ["transactions", "Transactions"],
  ["cashflow", "Cash Flow"],
  ["budget", "Budget"],
  ["investments", "Investments"],
  ["foresight", "Foresight"],
];

export default function Dashboard() {
  const { username, logout } = useAuth();
  const [txns, setTxns] = useState([]);
  const [, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("claud_theme") || "dark");
  const [rollover, setRollover] = useState(false);
  const [planning, setPlanning] = useState({ fs_age: "", fs_life: "", fs_housing: "" });
  const menuRef = useRef(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setRollover(s.budget_rollover === "1");
      setPlanning({ fs_age: s.fs_age ?? "", fs_life: s.fs_life ?? "", fs_housing: s.fs_housing ?? "" });
    }).catch(() => {});
  }, []);
  async function toggleRollover(on) {
    setRollover(on);
    try {
      await api.setSetting("budget_rollover", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  async function savePlanning(key, value) {
    setPlanning((p) => ({ ...p, [key]: value }));
    try {
      await api.setSetting(key, value);
    } catch {
      /* ignore */
    }
  }

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

  // Apply + persist theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("claud_theme", theme);
  }, [theme]);

  // Close the user menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const current = TABS.find(([k]) => k === tab);
  const title =
    tab === "dashboard"
      ? `Welcome back, ${username}`
      : tab === "settings"
      ? "Settings"
      : current
      ? current[1]
      : "Claud";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <img src={logo} className="brand-logo" alt="" />
          <span className="side-brandname">Claud</span>
        </div>

        <nav className="side-nav">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={`side-tab ${tab === key ? "side-on" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="side-user" ref={menuRef}>
          {menuOpen && (
            <div className="user-menu">
              <button
                className="user-menu-item"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <button className="user-menu-item" onClick={() => { setMenuOpen(false); setTab("settings"); }}>
                Settings
              </button>
              <button className="user-menu-item danger" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
          <button className="user-btn" onClick={() => setMenuOpen((v) => !v)}>
            <span className="user-avatar">{username.slice(0, 1).toUpperCase()}</span>
            <span className="user-name">{username}</span>
            <span className="user-caret">▾</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <h1>{title}</h1>
          <div id="page-actions" className="page-actions" />
        </header>

        {error && <div className="error">{error}</div>}

        {tab === "dashboard" && <Home txns={txns} reload={load} />}
        {tab === "accounts" && <AccountsTab txns={txns} reload={load} />}
        {tab === "transactions" && <Transactions txns={txns} reload={load} />}
        {tab === "cashflow" && <CashFlowTab txns={txns} />}
        {tab === "budget" && <BudgetTab txns={txns} />}
        {tab === "investments" && <InvestmentsTab />}
        {tab === "foresight" && <ForesightTab txns={txns} />}
        {tab === "settings" && (
          <section className="card settings-card">
            <div className="setting-row">
              <div>
                <strong>Appearance</strong>
                <p className="muted">Switch between light and dark themes.</p>
              </div>
              <div className="seg">
                <button
                  className={`seg-btn ${theme === "dark" ? "seg-on" : ""}`}
                  onClick={() => setTheme("dark")}
                >
                  Dark
                </button>
                <button
                  className={`seg-btn ${theme === "light" ? "seg-on" : ""}`}
                  onClick={() => setTheme("light")}
                >
                  Light
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Budget rollover</strong>
                <p className="muted">Carry each category's leftover budget into the next month.</p>
              </div>
              <div className="seg">
                <button className={`seg-btn ${rollover ? "seg-on" : ""}`} onClick={() => toggleRollover(true)}>On</button>
                <button className={`seg-btn ${!rollover ? "seg-on" : ""}`} onClick={() => toggleRollover(false)}>Off</button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Your age</strong>
                <p className="muted">Used by Foresight to project your timeline.</p>
              </div>
              <input className="setting-input" type="number" value={planning.fs_age} placeholder="30" onChange={(e) => savePlanning("fs_age", e.target.value)} />
            </div>
            <div className="setting-row">
              <div>
                <strong>Life expectancy (age)</strong>
                <p className="muted">How far out Foresight projects your net worth.</p>
              </div>
              <input className="setting-input" type="number" value={planning.fs_life} placeholder="90" onChange={(e) => savePlanning("fs_life", e.target.value)} />
            </div>
            <div className="setting-row">
              <div>
                <strong>Current rent / mortgage (mo)</strong>
                <p className="muted">Your monthly housing cost, used in Foresight projections.</p>
              </div>
              <input className="setting-input" type="number" value={planning.fs_housing} placeholder="0" onChange={(e) => savePlanning("fs_housing", e.target.value)} />
            </div>
            <div className="setting-row">
              <div>
                <strong>Account</strong>
                <p className="muted">Signed in as {username}.</p>
              </div>
              <button className="btn ghost" onClick={logout}>Sign out</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
