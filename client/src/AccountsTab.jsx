import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import {
  INSTITUTIONS,
  ACCOUNT_TYPES,
  GROUPS,
  institutionFor,
  typeLabel,
  accountGroup,
  kindForGroup,
} from "./institutions.js";
import InvestmentHoldings from "./InvestmentHoldings.jsx";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

// Net-worth value: server-computed `value` (investments price live) when
// present, else the stored balance.
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

function Badge({ institution }) {
  const inst = institutionFor(institution);
  return (
    <span className="inst-badge" style={{ background: inst.bg, color: inst.fg }} title={inst.label}>
      {inst.abbr}
    </span>
  );
}

// Add / edit account in a centered modal.
function AccountModal({ initial, onSubmit, onClose }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isOther = f.type === "other";
  const isInvestment = f.type === "investment";
  const editing = initial.id != null;
  const valid = f.name.trim() && (!isOther || f.group);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="modal-title">{editing ? "Edit account" : "Add account"}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit({
              name: f.name.trim(),
              type: f.type,
              institution: f.institution,
              balance: isInvestment ? 0 : Number(f.balance) || 0,
              group: isOther ? f.group : undefined,
            });
          }}
        >
          <div className="field">
            <label>Name</label>
            <input value={f.name} onChange={set("name")} autoFocus placeholder="e.g. Everyday Chequing" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Type</label>
              <select value={f.type} onChange={set("type")}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Institution</label>
              <select value={f.institution} onChange={set("institution")}>
                {INSTITUTIONS.map((i) => (
                  <option key={i.key} value={i.key}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>
          {isOther && (
            <div className="field">
              <label>Which group does it belong to?</label>
              <select value={f.group} onChange={set("group")}>
                <option value="">Select a group…</option>
                {GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({g.kind === "asset" ? "asset" : "liability"})
                  </option>
                ))}
              </select>
            </div>
          )}
          {isInvestment ? (
            <p className="muted form-note">Add stock holdings after creating.</p>
          ) : (
            <div className="field">
              <label>Balance</label>
              <input type="number" step="0.01" value={f.balance} onChange={set("balance")} placeholder="0.00" />
            </div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="submit" disabled={!valid}>
              {editing ? "Save" : "Add account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { initial }
  const [expandedId, setExpandedId] = useState(null);

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

  const netWorth = useMemo(
    () =>
      accounts.reduce((s, a) => {
        const v = acctValue(a);
        return s + (kindForGroup(accountGroup(a)) === "liability" ? -v : v);
      }, 0),
    [accounts]
  );

  function openAdd() {
    setModal({ initial: { name: "", type: "chequing", institution: "rbc", balance: "", group: "" } });
  }
  function openEdit(a) {
    setModal({
      initial: { id: a.id, name: a.name, type: a.type, institution: a.institution, balance: a.balance, group: accountGroup(a) },
    });
  }
  async function submitModal(data) {
    try {
      if (modal.initial.id != null) await api.updateAccount(modal.initial.id, data);
      else await api.addAccount(data);
      setModal(null);
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
              <button className="link sm acct-type" onClick={() => setExpandedId(open ? null : a.id)}>
                {a.holdingsCount || 0} holding{(a.holdingsCount || 0) === 1 ? "" : "s"} {open ? "▲" : "▼"}
              </button>
            </div>
            <div className="acct-invest-val">
              <span className="acct-itemname">{fmt(acctValue(a))}</span>
              <span className={`hd-sub ${growth >= 0 ? "pos" : "neg"}`}>
                {growth >= 0 ? "+" : ""}{fmt(growth)} ({growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%)
              </span>
            </div>
            <button className="link sm" onClick={() => openEdit(a)}>Edit</button>
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
        <button className="link sm" onClick={() => openEdit(a)}>Edit</button>
        <button className="x" title="Delete" onClick={() => remove(a.id)}>×</button>
      </div>
    );
  }

  function renderGroup(g) {
    const list = accounts.filter((a) => accountGroup(a) === g.key);
    const total = list.reduce((s, a) => s + acctValue(a), 0);
    return (
      <section className="card acct-group" key={g.key}>
        <div className="acct-group-head">
          <span className="muted">{g.label}</span>
          <strong className={g.kind === "liability" ? "neg" : "pos"}>
            {g.kind === "liability" && total !== 0 ? "−" : ""}{fmt(total)}
          </strong>
        </div>
        {list.length === 0 ? <p className="muted empty sm">None yet.</p> : list.map(renderAccount)}
      </section>
    );
  }

  return (
    <div className="accounts-tab">
      {error && <div className="error">{error}</div>}

      <section className="card networth-card">
        <span className="muted">Net worth</span>
        <strong className={netWorth >= 0 ? "pos" : "neg"}>{fmt(netWorth)}</strong>
      </section>

      <div className="acct-addbar">
        <button className="btn primary" onClick={openAdd}>+ Add account</button>
      </div>

      <div className="acct-groups">{GROUPS.map(renderGroup)}</div>

      {modal && (
        <AccountModal initial={modal.initial} onSubmit={submitModal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
