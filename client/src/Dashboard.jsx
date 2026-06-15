import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import logo from "./logo.svg";
import { Icon } from "./ds.jsx";
import Home from "./Home.jsx";
import AccountsTab from "./AccountsTab.jsx";
import Transactions from "./Transactions.jsx";
import CashFlowTab from "./CashFlowTab.jsx";
import BudgetTab from "./BudgetTab.jsx";
import InvestmentsTab from "./InvestmentsTab.jsx";
import ForesightTab from "./ForesightTab.jsx";

const TABS = [
  { key: "dashboard",    label: "Dashboard",    icon: "grid"     },
  { key: "accounts",     label: "Accounts",     icon: "bank"     },
  { key: "transactions", label: "Transactions", icon: "card"     },
  { key: "cashflow",     label: "Cash Flow",    icon: "trending" },
  { key: "budget",       label: "Budget",       icon: "chart"    },
  { key: "investments",  label: "Investments",  icon: "shield"   },
  { key: "foresight",    label: "Foresight",    icon: "target"   },
];

const ACCENTS = {
  Terracotta: { light: "#c05f2e", dark: "#cf7846" },
  Amber:      { light: "#b07a1a", dark: "#d49a2c" },
  Clay:       { light: "#a0522d", dark: "#c07040" },
  Olive:      { light: "#6b7c32", dark: "#8da040" },
};

const SURFACES = ["sand", "cream", "linen"];

export default function Dashboard() {
  const { username, logout } = useAuth();
  const email = null;
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("appearance");

  const [theme, setTheme] = useState(() => localStorage.getItem("claud_theme") || "dark");
  const [surface, setSurface] = useState(() => localStorage.getItem("claud_surface") || "linen");
  const [accent, setAccent] = useState(() => localStorage.getItem("claud_accent") || "Terracotta");

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
    try { await api.setSetting("budget_rollover", on ? "1" : "0"); } catch {}
  }
  async function savePlanning(key, value) {
    setPlanning((p) => ({ ...p, [key]: value }));
    try { await api.setSetting(key, value); } catch {}
  }

  async function load() {
    try { setTxns(await api.listTransactions()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  /* Apply theme / surface / accent to <html> */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("claud_theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-surface", surface);
    } else {
      root.removeAttribute("data-surface");
    }
    localStorage.setItem("claud_surface", surface);
  }, [theme, surface]);

  useEffect(() => {
    const { light, dark } = ACCENTS[accent] ?? ACCENTS.Terracotta;
    const root = document.documentElement;
    root.style.setProperty("--accent", theme === "dark" ? dark : light);
    localStorage.setItem("claud_accent", accent);
  }, [accent, theme]);

  /* Close menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="app">
      {/* ---- Sidebar ---- */}
      <aside className="sidebar">
        <div className="side-brand">
          <img src={logo} className="brand-logo" alt="" />
          <span className="side-brandname">Claud</span>
        </div>

        <nav className="side-nav">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`side-tab${tab === key ? " side-on" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className="user-wrap" ref={menuRef}>
            {menuOpen && (
              <div className="user-menu">
                <div className="user-menu-head">
                  <span className="avatar" style={{ width: 36, height: 36 }}>{initials}</span>
                  <div className="umh-id">
                    <div className="umh-name">{username}</div>
                    <div className="umh-mail">{email ?? ""}</div>
                  </div>
                </div>
                <div className="user-menu-list">
                  <button className="um-item" onClick={() => { setMenuOpen(false); setSettingsOpen(true); setSettingsSection("appearance"); }}>
                    <Icon name="settings" />
                    Settings
                  </button>
                  <button className="um-item" onClick={() => { setMenuOpen(false); setSettingsOpen(true); setSettingsSection("profile"); }}>
                    <Icon name="user" />
                    Profile
                  </button>
                </div>
                <div className="user-menu-foot">
                  <button className="um-item danger" onClick={logout}>
                    <Icon name="logout" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
            <button className="user-btn" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar">{initials}</span>
              <span className="user-name">
                {username}
                <span className="user-sub">{email ?? "Free plan"}</span>
              </span>
              <span className="user-caret">▾</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Main ---- */}
      <main className="main">
        <div className="main-inner">
          {error && <div className="error">{error}</div>}
          {tab === "dashboard"    && <Home txns={txns} reload={load} theme={theme} setTheme={setTheme} onSettings={() => { setSettingsOpen(true); setSettingsSection("appearance"); }} />}
          {tab === "accounts"     && <AccountsTab txns={txns} reload={load} />}
          {tab === "transactions" && <Transactions txns={txns} reload={load} />}
          {tab === "cashflow"     && <CashFlowTab txns={txns} />}
          {tab === "budget"       && <BudgetTab txns={txns} rollover={rollover} onToggleRollover={toggleRollover} />}
          {tab === "investments"  && <InvestmentsTab />}
          {tab === "foresight"    && <ForesightTab txns={txns} planning={planning} savePlanning={savePlanning} />}
        </div>
      </main>

      {/* ---- Settings modal ---- */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          section={settingsSection}
          setSection={setSettingsSection}
          theme={theme} setTheme={setTheme}
          surface={surface} setSurface={setSurface}
          accent={accent} setAccent={setAccent}
          rollover={rollover} onToggleRollover={toggleRollover}
          planning={planning} savePlanning={savePlanning}
          username={username} email={email} logout={logout}
        />
      )}
    </div>
  );
}

function SettingsModal({ onClose, section, setSection, theme, setTheme, surface, setSurface, accent, setAccent, rollover, onToggleRollover, planning, savePlanning, username, email, logout }) {
  const SETTINGS_NAV = [
    { key: "appearance",   label: "Appearance",   icon: "sun"      },
    { key: "preferences",  label: "Preferences",  icon: "sliders"  },
    { key: "profile",      label: "Profile",      icon: "user"     },
    { key: "account",      label: "Account",      icon: "shield"   },
  ];

  return (
    <div className="set-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="set-modal" role="dialog" aria-label="Settings">
        <div className="set-head">
          <h2>Settings</h2>
          <button className="set-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="set-main">
          <nav className="set-nav">
            {SETTINGS_NAV.map(({ key, label, icon }) => (
              <button key={key} className={section === key ? "on" : ""} onClick={() => setSection(key)}>
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </nav>
          <div className="set-body">
            {section === "appearance" && (
              <>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Theme</span>
                    <span className="srl-d">Choose between light and dark mode.</span>
                  </div>
                  <div className="set-row-control">
                    <div className="seg">
                      <button className={"seg-btn" + (theme === "dark" ? " seg-on" : "")} onClick={() => setTheme("dark")}>
                        <Icon name="moon" style={{ width: 13, height: 13 }} /> Dark
                      </button>
                      <button className={"seg-btn" + (theme === "light" ? " seg-on" : "")} onClick={() => setTheme("light")}>
                        <Icon name="sun" style={{ width: 13, height: 13 }} /> Light
                      </button>
                    </div>
                  </div>
                </div>
                {theme === "light" && (
                  <div className="set-row">
                    <div className="set-row-label">
                      <span className="srl-t">Surface</span>
                      <span className="srl-d">Background warmth for the light theme.</span>
                    </div>
                    <div className="set-row-control">
                      <div className="seg">
                        {SURFACES.map(s => (
                          <button key={s} className={"seg-btn" + (surface === s ? " seg-on" : "")} onClick={() => setSurface(s)}>
                            {s[0].toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Accent colour</span>
                    <span className="srl-d">The highlight colour used throughout the app.</span>
                  </div>
                  <div className="set-row-control">
                    <div className="set-swatches">
                      {Object.entries(ACCENTS).map(([name, colors]) => (
                        <button
                          key={name}
                          className={"set-sw" + (accent === name ? " on" : "")}
                          style={{ background: theme === "dark" ? colors.dark : colors.light }}
                          title={name}
                          onClick={() => setAccent(name)}
                        >
                          {accent === name && <Icon name="check" style={{ width: 14, height: 14 }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {section === "preferences" && (
              <>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Budget rollover</span>
                    <span className="srl-d">Carry leftover category budgets into the next month.</span>
                  </div>
                  <div className="set-row-control">
                    <button className={"roll-switch" + (rollover ? " on" : "")} onClick={() => onToggleRollover(!rollover)}>
                      <span className="roll-knob" />
                    </button>
                  </div>
                </div>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Currency</span>
                    <span className="srl-d">Display currency used across the app.</span>
                  </div>
                  <div className="set-row-control">
                    <select className="set-select" defaultValue="CAD">
                      <option value="CAD">CAD — Canadian Dollar</option>
                      <option value="USD">USD — US Dollar</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {section === "profile" && (
              <>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Your age</span>
                    <span className="srl-d">Used by Foresight to project your retirement timeline.</span>
                  </div>
                  <div className="set-row-control">
                    <input className="set-input" type="number" value={planning.fs_age} placeholder="30" style={{ width: 100 }} onChange={(e) => savePlanning("fs_age", e.target.value)} />
                  </div>
                </div>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Life expectancy</span>
                    <span className="srl-d">How far out Foresight projects your net worth.</span>
                  </div>
                  <div className="set-row-control">
                    <input className="set-input" type="number" value={planning.fs_life} placeholder="90" style={{ width: 100 }} onChange={(e) => savePlanning("fs_life", e.target.value)} />
                  </div>
                </div>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Monthly housing cost</span>
                    <span className="srl-d">Rent or mortgage used in Foresight projections.</span>
                  </div>
                  <div className="set-row-control">
                    <input className="set-input" type="number" value={planning.fs_housing} placeholder="0" style={{ width: 120 }} onChange={(e) => savePlanning("fs_housing", e.target.value)} />
                  </div>
                </div>
              </>
            )}
            {section === "account" && (
              <>
                <div className="set-row">
                  <div className="set-row-label">
                    <span className="srl-t">Signed in as</span>
                    <span className="srl-d">{email ?? username}</span>
                  </div>
                  <div className="set-row-control">
                    <button className="btn ghost sm" onClick={logout}>Sign out</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
