import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ACCOUNT_TYPES, GROUPS, typeLabel, accountGroup, kindForGroup } from "./institutions.js";
import AccountIcon from "./AccountIcon.jsx";
import InvestmentHoldings from "./InvestmentHoldings.jsx";
import { shortenMerchant } from "./merchant.js";
import PageActions from "./PageActions.jsx";
import GranularityTabs from "./widgets/GranularityTabs.jsx";
import { netWorthSeries, accountsNetWorth } from "./timeseries.js";
import { fileToIcon } from "./imageIcon.js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const fmt0 = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

const TX_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other", "Uncategorized",
];

// Window listing — and managing — the transactions linked to one account.
function AccountTxModal({ account, onClose, onChanged }) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [aType, setAType] = useState("expense");
  const [aAmount, setAAmount] = useState("");
  const [aCategory, setACategory] = useState("");
  const [aDate, setADate] = useState("");

  async function reloadList() {
    try {
      setTxns(await api.listAccountTransactions(account.id));
    } catch {
      setTxns([]);
    }
  }
  useEffect(() => {
    let live = true;
    api
      .listAccountTransactions(account.id)
      .then((r) => live && setTxns(r))
      .catch(() => live && setTxns([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [account.id]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function addTx(e) {
    e.preventDefault();
    setError("");
    const amt = Number(aAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    try {
      await api.addTransaction({
        type: aType,
        amount: amt,
        category: aCategory.trim() || (aType === "income" ? "Income" : "Other"),
        date: aDate || undefined,
        account_id: account.id,
      });
      setAAmount("");
      setACategory("");
      setADate("");
      setAddOpen(false);
      await reloadList();
      onChanged?.();
    } catch (err) {
      setError(err.message || "Couldn't add transaction.");
    }
  }
  async function removeTx(id) {
    setError("");
    try {
      await api.deleteTransaction(id);
      await reloadList();
      onChanged?.();
    } catch (err) {
      setError(err.message || "Couldn't delete transaction.");
    }
  }

  const count = txns.length;
  const total = txns.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Number(t.amount || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide acct-tx-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="acct-tx-title">
            <span className="modal-title">{account.name}</span>
            <span className="muted sm">
              {typeLabel(account.type)}{account.last4 ? ` ··${account.last4}` : ""} · {fmt(acctValue(account))}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="acct-tx-toolbar">
          <span className="muted sm">
            {loading ? "Loading…" : `${count} transaction${count === 1 ? "" : "s"}`}
            {!loading && count > 0 && (
              <span className={total >= 0 ? "pos" : "neg"}> · net {total >= 0 ? "+" : "−"}{fmt(Math.abs(total))}</span>
            )}
          </span>
          <button className="btn ghost sm" onClick={() => { setAddOpen((v) => !v); setError(""); }}>
            {addOpen ? "Cancel" : "+ Add transaction"}
          </button>
        </div>

        {addOpen && (
          <form className="acct-tx-add" onSubmit={addTx}>
            <select value={aType} onChange={(e) => setAType(e.target.value)} aria-label="Type">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number" step="0.01" min="0" placeholder="Amount"
              value={aAmount} onChange={(e) => setAAmount(e.target.value)} required
            />
            <select value={aCategory} onChange={(e) => setACategory(e.target.value)} aria-label="Category">
              <option value="">Category…</option>
              {TX_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} aria-label="Date" />
            <button className="btn primary sm" type="submit">Add</button>
          </form>
        )}

        {error && <div className="error sm">{error}</div>}

        {loading ? null : count === 0 ? (
          <p className="muted sm acct-tx-empty">
            No transactions linked yet. Add one above, or import a statement whose last 4 digits match this account
            {account.last4 ? ` (${account.last4})` : ""}.
          </p>
        ) : (
          <div className="acct-tx-scroll">
            <table className="acct-tx-table">
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td className="muted nowrap acct-tx-date">{t.date}</td>
                    <td className="acct-tx-name" title={t.description || t.category}>
                      {t.description ? shortenMerchant(t.description) : t.category}
                    </td>
                    <td className="muted acct-tx-cat">{t.category}</td>
                    <td className={`right nowrap ${t.type === "income" ? "pos" : "neg"}`}>
                      {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                    </td>
                    <td className="right">
                      <button className="x" title="Delete transaction" onClick={() => removeTx(t.id)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Net-worth value: server-computed `value` (investments price live) when
// present, else the stored balance.
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

function Badge({ type, icon }) {
  if (icon) {
    return (
      <span className="acct-badge has-img">
        <img src={icon} alt="" />
      </span>
    );
  }
  return (
    <span className="acct-badge">
      <AccountIcon type={type} />
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
              last4: f.last4 || "",
              icon: f.icon || "",
            });
          }}
        >
          <div className="field">
            <label>Name</label>
            <input value={f.name} onChange={set("name")} autoFocus placeholder="e.g. Everyday Chequing" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={f.type} onChange={set("type")}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Icon</label>
            <div className="icon-field">
              {f.icon ? (
                <span className="acct-badge has-img icon-preview"><img src={f.icon} alt="" /></span>
              ) : (
                <span className="acct-badge icon-preview">
                  <AccountIcon type={f.type} />
                </span>
              )}
              <label className="btn ghost sm icon-upload">
                Upload
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const icon = await fileToIcon(file);
                        setF((prev) => ({ ...prev, icon }));
                      } catch {
                        /* ignore */
                      }
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {f.icon && (
                <button type="button" className="link sm" onClick={() => setF((prev) => ({ ...prev, icon: "" }))}>
                  Remove
                </button>
              )}
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
            <div className="field-row">
              <div className="field">
                <label>Starting balance</label>
                <input type="number" step="0.01" value={f.balance} onChange={set("balance")} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Last 4 digits</label>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={f.last4}
                  onChange={set("last4")}
                  placeholder="e.g. 2739"
                />
              </div>
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

export default function AccountsTab({ txns = [], reload }) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { initial }
  const [expandedId, setExpandedId] = useState(null);
  const [txAccount, setTxAccount] = useState(null); // account whose txns window is open
  const [gran, setGran] = useState("month");

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

  // Assets vs debt totals + per-group subtotals for the summary panel.
  const summary = useMemo(() => {
    const byGroup = {};
    let assets = 0;
    let debt = 0;
    for (const a of accounts) {
      const g = accountGroup(a);
      const v = acctValue(a);
      byGroup[g] = (byGroup[g] || 0) + v;
      if (kindForGroup(g) === "liability") debt += v;
      else assets += v;
    }
    return { assets, debt, byGroup };
  }, [accounts]);

  // Net worth over time (cumulative from transactions, anchored to current accounts).
  const nwSeries = useMemo(
    () => netWorthSeries(txns || [], gran, accountsNetWorth(accounts)),
    [txns, gran, accounts]
  );

  function openAdd() {
    setModal({ initial: { name: "", type: "chequing", institution: "other", balance: "", group: "", last4: "", icon: "" } });
  }
  function openEdit(a) {
    setModal({
      initial: {
        id: a.id, name: a.name, type: a.type, institution: a.institution,
        balance: a.balance, group: accountGroup(a), last4: a.last4 || "", icon: a.icon || "",
      },
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
            <Badge type={a.type} icon={a.icon} />
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
      <div
        key={a.id}
        className="acct-item acct-clickable"
        onClick={() => setTxAccount(a)}
        title="View transactions"
      >
        <Badge type={a.type} icon={a.icon} />
        <div className="acct-info">
          <span className="acct-itemname">{a.name}</span>
          <span className="acct-type muted">
            {typeLabel(a.type)}{a.last4 ? ` ··${a.last4}` : ""}
          </span>
        </div>
        <span className="acct-itemval">{fmt(acctValue(a))}</span>
        <button className="link sm" onClick={(e) => { e.stopPropagation(); openEdit(a); }}>Edit</button>
        <button className="x" title="Delete" onClick={(e) => { e.stopPropagation(); remove(a.id); }}>×</button>
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
      <PageActions>
        <button className="btn primary sm" onClick={openAdd}>+ Add account</button>
      </PageActions>

      {error && <div className="error">{error}</div>}

      <section className="card chart-card nw-chart">
        <div className="widget-head">
          <div>
            <span className="muted">Net worth</span>
            <div className={`widget-value ${netWorth >= 0 ? "pos" : "neg"}`}>{fmt(netWorth)}</div>
          </div>
          <GranularityTabs value={gran} onChange={setGran} />
        </div>
        {nwSeries.length === 0 ? (
          <p className="muted empty">Add transactions to see net worth over time.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={nwSeries} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} width={52} fontSize={12} tickFormatter={fmt0} />
              <Tooltip
                formatter={(v) => [fmt(v), "Net worth"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="acct-layout">
        <div className="acct-left">{GROUPS.map(renderGroup)}</div>

        <aside className="acct-summary card">
          <span className="muted">Summary</span>
          <div className="summary-row total">
            <span>Assets</span>
            <strong className="pos">{fmt(summary.assets)}</strong>
          </div>
          {GROUPS.filter((g) => g.kind === "asset").map((g) => (
            <div key={g.key} className="summary-row sub">
              <span className="muted">{g.label}</span>
              <span>{fmt(summary.byGroup[g.key] || 0)}</span>
            </div>
          ))}
          <div className="summary-row total">
            <span>Debt</span>
            <strong className="neg">{fmt(summary.debt)}</strong>
          </div>
          {GROUPS.filter((g) => g.kind === "liability").map((g) => (
            <div key={g.key} className="summary-row sub">
              <span className="muted">{g.label}</span>
              <span>{fmt(summary.byGroup[g.key] || 0)}</span>
            </div>
          ))}
          <div className="summary-row net">
            <span>Net worth</span>
            <strong className={netWorth >= 0 ? "pos" : "neg"}>{fmt(netWorth)}</strong>
          </div>
        </aside>
      </div>

      {modal && (
        <AccountModal initial={modal.initial} onSubmit={submitModal} onClose={() => setModal(null)} />
      )}
      {txAccount && (
        <AccountTxModal
          account={txAccount}
          onClose={() => setTxAccount(null)}
          onChanged={() => { load(); reload?.(); }}
        />
      )}
    </div>
  );
}
