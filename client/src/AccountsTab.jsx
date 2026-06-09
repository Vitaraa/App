import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import {
  INSTITUTIONS,
  ACCOUNT_TYPES,
  institutionFor,
  typeLabel,
  kindForType,
} from "./institutions.js";
import InvestmentHoldings from "./InvestmentHoldings.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

// Net-worth value of an account: server-computed `value` (investments price
// live) when present, else the stored balance.
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

function Badge({ institution }) {
  const inst = institutionFor(institution);
  return (
    <span className="inst-badge" style={{ background: inst.bg, color: inst.fg }} title={inst.label}>
      {inst.abbr}
    </span>
  );
}

const blankForm = { name: "", type: "chequing", institution: "rbc", balance: "" };

function AccountForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial || blankForm);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isInvestment = f.type === "investment";
  return (
    <form
      className="acct-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        onSubmit({
          name: f.name.trim(),
          type: f.type,
          institution: f.institution,
          balance: isInvestment ? 0 : Number(f.balance) || 0,
        });
      }}
    >
      <input placeholder="Account name" value={f.name} onChange={set("name")} autoFocus />
      <div className="acct-form-row">
        <select value={f.type} onChange={set("type")}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label} ({t.kind === "asset" ? "+" : "−"})
            </option>
          ))}
        </select>
        <select value={f.institution} onChange={set("institution")}>
          {INSTITUTIONS.map((i) => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </select>
      </div>
      <div className="acct-form-row">
        {!isInvestment && (
          <input type="number" step="0.01" placeholder="Balance" value={f.balance} onChange={set("balance")} />
        )}
        {isInvestment && <span className="muted form-note">Add stock holdings after creating.</span>}
        <button className="btn primary sm" type="submit">{submitLabel}</button>
        {onCancel && (
          <button className="btn ghost sm" type="button" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}

export default function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null); // investment holdings open

  async function load() {
    try {
      setAccounts(await api.listAccounts());
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const { assets, liabilities, assetTotal, liabilityTotal, netWorth } = useMemo(() => {
    const assets = accounts.filter((a) => kindForType(a.type, a.kind) === "asset");
    const liabilities = accounts.filter((a) => kindForType(a.type, a.kind) === "liability");
    const assetTotal = assets.reduce((s, a) => s + acctValue(a), 0);
    const liabilityTotal = liabilities.reduce((s, a) => s + acctValue(a), 0);
    return { assets, liabilities, assetTotal, liabilityTotal, netWorth: assetTotal - liabilityTotal };
  }, [accounts]);

  async function addAccount(data) {
    try {
      await api.addAccount(data);
      setAdding(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function saveEdit(id, data) {
    try {
      await api.updateAccount(id, data);
      setEditingId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function saveBalance(a, value) {
    const bal = Number(value);
    if (!Number.isFinite(bal) || bal === a.balance) return;
    await api.updateAccount(a.id, { balance: bal });
    load();
  }
  async function remove(id) {
    await api.deleteAccount(id);
    load();
  }

  function renderAccount(a) {
    if (editingId === a.id) {
      return (
        <AccountForm
          key={a.id}
          initial={{ name: a.name, type: a.type, institution: a.institution, balance: a.balance }}
          submitLabel="Save"
          onSubmit={(data) => saveEdit(a.id, data)}
          onCancel={() => setEditingId(null)}
        />
      );
    }
    if (a.type === "investment") {
      const growth = Number(a.growth || 0);
      const cost = Number(a.cost || 0);
      const growthPct = cost > 0 ? (growth / cost) * 100 : 0;
      const open = expandedId === a.id;
      return (
        <div key={a.id} className="acct-block">
          <div className="acct-item acct-invest">
            <Badge institution={a.institution} />
            <div className="acct-info">
              <span className="acct-itemname">{a.name}</span>
              <button
                className="link sm acct-type"
                onClick={() => setExpandedId(open ? null : a.id)}
              >
                Investment · {a.holdingsCount || 0} holding{(a.holdingsCount || 0) === 1 ? "" : "s"} {open ? "▲" : "▼"}
              </button>
            </div>
            <div className="acct-invest-val">
              <span className="acct-itemname">{fmt(acctValue(a))}</span>
              <span className={`hd-sub ${growth >= 0 ? "pos" : "neg"}`}>
                {growth >= 0 ? "+" : ""}{fmt(growth)} ({growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%)
              </span>
            </div>
            <button className="link sm" onClick={() => setEditingId(a.id)}>Edit</button>
            <button className="x" title="Delete" onClick={() => remove(a.id)}>×</button>
          </div>
          {open && <InvestmentHoldings accountId={a.id} onChange={load} />}
        </div>
      );
    }
    return (
      <div key={a.id} className="acct-item">
        <Badge institution={a.institution} />
        <div className="acct-info">
          <span className="acct-itemname">{a.name}</span>
          <span className="acct-type muted">{typeLabel(a.type)}</span>
        </div>
        <input
          className="acct-itembal"
          type="number"
          step="0.01"
          defaultValue={a.balance}
          onBlur={(e) => saveBalance(a, e.target.value)}
        />
        <button className="link sm" onClick={() => setEditingId(a.id)}>Edit</button>
        <button className="x" title="Delete" onClick={() => remove(a.id)}>×</button>
      </div>
    );
  }

  function renderGroup(title, list, sign) {
    return (
      <section className="card acct-group">
        <div className="acct-group-head">
          <span className="muted">{title}</span>
          <strong className={sign === "+" ? "pos" : "neg"}>
            {sign === "+" ? "" : "−"}{fmt(list.reduce((s, a) => s + acctValue(a), 0))}
          </strong>
        </div>
        {list.length === 0 ? <p className="muted empty sm">None yet.</p> : list.map(renderAccount)}
      </section>
    );
  }

  return (
    <div className="accounts-tab">
      {error && <div className="error">{error}</div>}

      <section className="stats">
        <div className="card stat">
          <span className="muted">Assets</span>
          <strong className="pos">{fmt(assetTotal)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Liabilities</span>
          <strong className="neg">{fmt(liabilityTotal)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Net worth</span>
          <strong className={netWorth >= 0 ? "pos" : "neg"}>{fmt(netWorth)}</strong>
        </div>
      </section>

      <div className="acct-addbar">
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add account"}
        </button>
      </div>
      {adding && (
        <section className="card">
          <AccountForm submitLabel="Add account" onSubmit={addAccount} />
        </section>
      )}

      <div className="acct-groups">
        {renderGroup("Assets", assets, "+")}
        {renderGroup("Liabilities", liabilities, "-")}
      </div>
    </div>
  );
}
