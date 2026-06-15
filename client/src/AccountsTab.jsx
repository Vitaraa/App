import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ACCOUNT_TYPES, GROUPS, typeLabel, accountGroup, kindForGroup } from "./institutions.js";
import AccountIcon from "./AccountIcon.jsx";
import InvestmentHoldings from "./InvestmentHoldings.jsx";
import { shortenMerchant } from "./merchant.js";
import { netWorthSeries, accountsNetWorth } from "./timeseries.js";
import { fileToIcon } from "./imageIcon.js";
import { Icon } from "./ds.jsx";
import { NetWorthChart, fmt } from "./charts.jsx";

// Net-worth value: server-computed `value` (investments price live) when
// present, else the stored balance.
const acctValue = (a) => (a.value != null ? Number(a.value) : Number(a.balance || 0));

const TX_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other", "Uncategorized",
];

function AccountBadge({ type, icon }) {
  if (icon) return <span className="acct-ico"><img src={icon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }} /></span>;
  return <span className="acct-ico"><AccountIcon type={type} /></span>;
}

/* ============================================================
   ACCOUNT TRANSACTIONS MODAL
   ============================================================ */
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
    try { setTxns(await api.listAccountTransactions(account.id)); }
    catch { setTxns([]); }
  }
  useEffect(() => {
    let live = true;
    api.listAccountTransactions(account.id)
      .then((r) => live && setTxns(r))
      .catch(() => live && setTxns([]))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
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
    if (!Number.isFinite(amt) || amt <= 0) { setError("Enter a positive amount."); return; }
    try {
      await api.addTransaction({
        type: aType, amount: amt,
        category: aCategory.trim() || (aType === "income" ? "Income" : "Other"),
        date: aDate || undefined, account_id: account.id,
      });
      setAAmount(""); setACategory(""); setADate(""); setAddOpen(false);
      await reloadList();
      onChanged?.();
    } catch (err) { setError(err.message || "Couldn't add transaction."); }
  }
  async function removeTx(id) {
    setError("");
    try { await api.deleteTransaction(id); await reloadList(); onChanged?.(); }
    catch (err) { setError(err.message || "Couldn't delete transaction."); }
  }

  const count = txns.length;
  const total = txns.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Number(t.amount || 0), 0);

  return (
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-modal" style={{ maxWidth: 620 }} role="dialog" aria-modal="true">
        <div className="fs-modal-head">
          <div className="fs-modal-title" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span>{account.name}</span>
            <span className="muted" style={{ fontSize: "var(--text-2xs)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
              {typeLabel(account.type)}{account.last4 ? ` ··${account.last4}` : ""} · {fmt(acctValue(account), 2)}
            </span>
          </div>
          <button className="fs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ padding: "14px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {loading ? "Loading…" : `${count} transaction${count === 1 ? "" : "s"}`}
            {!loading && count > 0 && (
              <span className={total >= 0 ? "pos" : "neg"}> · net {total >= 0 ? "+" : "−"}{fmt(Math.abs(total), 2)}</span>
            )}
          </span>
          <button className="btn ghost sm" onClick={() => { setAddOpen((v) => !v); setError(""); }}>
            {addOpen ? "Cancel" : "+ Add transaction"}
          </button>
        </div>

        {addOpen && (
          <form onSubmit={addTx} style={{ padding: "10px 20px" }}>
            <div className="field-row" style={{ gridTemplateColumns: "auto 1fr 1fr auto auto", alignItems: "end", gap: 8 }}>
              <select value={aType} onChange={(e) => setAType(e.target.value)} aria-label="Type" style={{ marginTop: 0 }}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input type="number" step="0.01" min="0" placeholder="Amount" value={aAmount} onChange={(e) => setAAmount(e.target.value)} required style={{ marginTop: 0 }} />
              <select value={aCategory} onChange={(e) => setACategory(e.target.value)} aria-label="Category" style={{ marginTop: 0 }}>
                <option value="">Category…</option>
                {TX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} aria-label="Date" style={{ marginTop: 0 }} />
              <button className="btn primary sm" type="submit">Add</button>
            </div>
          </form>
        )}

        {error && <div style={{ padding: "0 20px" }}><div className="error sm">{error}</div></div>}

        <div style={{ padding: "8px 14px 18px" }}>
          {loading ? null : count === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)", padding: "8px 6px", lineHeight: 1.5 }}>
              No transactions linked yet. Add one above, or import a statement whose last 4 digits match this account
              {account.last4 ? ` (${account.last4})` : ""}.
            </p>
          ) : (
            <div className="txn-table" style={{ maxHeight: "56vh", overflowY: "auto" }}>
              {txns.map((t) => (
                <div className="trow" key={t.id}>
                  <span className="trow-ico"><Icon name={t.type === "income" ? "income" : "expense"} /></span>
                  <div className="trow-main">
                    <span className="trow-name">{t.description ? shortenMerchant(t.description) : t.category}</span>
                    <div className="trow-tags"><span className="muted" style={{ fontSize: "var(--text-2xs)" }}>{t.category} · {t.date}</span></div>
                  </div>
                  <span className={"trow-amt " + (t.type === "income" ? "pos" : "")}>
                    {t.type === "income" ? "+" : "−"}{fmt(t.amount, 2)}
                  </span>
                  <button className="trow-del" title="Delete transaction" onClick={() => removeTx(t.id)}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ADD / EDIT ACCOUNT MODAL
   ============================================================ */
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
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-modal" role="dialog" aria-modal="true">
        <div className="fs-modal-head">
          <div className="fs-modal-title"><Icon name="bank" style={{ width: 20, height: 20 }} />{editing ? "Edit account" : "Add account"}</div>
          <button className="fs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit({
            name: f.name.trim(), type: f.type, institution: f.institution,
            balance: isInvestment ? 0 : Number(f.balance) || 0,
            group: isOther ? f.group : undefined,
            last4: f.last4 || "", icon: f.icon || "",
          });
        }}>
          <div className="fs-grid">
            <div className="fs-field">
              <span>Name</span>
              <input value={f.name} onChange={set("name")} autoFocus placeholder="e.g. Everyday Chequing" />
            </div>
            <div className="fs-field">
              <span>Type</span>
              <select value={f.type} onChange={set("type")}>
                {ACCOUNT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>

            <div className="fs-field full">
              <span>Icon</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {f.icon
                  ? <span className="acct-ico" style={{ width: 44, height: 44 }}><img src={f.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
                  : <span className="acct-ico" style={{ width: 44, height: 44 }}><AccountIcon type={f.type} /></span>}
                <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                  Upload
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) { try { setF((p) => ({ ...p, icon: await fileToIcon(file) })); } catch {} }
                    e.target.value = "";
                  }} />
                </label>
                {f.icon && <button type="button" className="link sm" onClick={() => setF((p) => ({ ...p, icon: "" }))}>Remove</button>}
              </div>
            </div>

            {isOther && (
              <div className="fs-field full">
                <span>Which group does it belong to?</span>
                <select value={f.group} onChange={set("group")}>
                  <option value="">Select a group…</option>
                  {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label} ({g.kind === "asset" ? "asset" : "liability"})</option>)}
                </select>
              </div>
            )}

            {isInvestment ? (
              <div className="fs-field full"><p className="muted" style={{ fontSize: "var(--text-xs)" }}>Add stock holdings after creating.</p></div>
            ) : (
              <>
                <div className="fs-field">
                  <span>Starting balance</span>
                  <input type="number" step="0.01" value={f.balance} onChange={set("balance")} placeholder="0.00" />
                </div>
                <div className="fs-field">
                  <span>Last 4 digits</span>
                  <input inputMode="numeric" maxLength={4} value={f.last4} onChange={set("last4")} placeholder="e.g. 2739" />
                </div>
              </>
            )}
          </div>
          <div className="fs-modal-foot">
            <button className="btn ghost sm" type="button" onClick={onClose}>Cancel</button>
            <div className="right">
              <button className="btn primary sm" type="submit" disabled={!valid}>{editing ? "Save" : "Add account"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   ACCOUNTS PAGE
   ============================================================ */
const ACCT_ICON = {
  chequing: "bank", savings: "piggy", cash: "wallet", investment: "chart",
  credit_card: "card", mortgage: "home", line_of_credit: "card",
  student_loan: "file", auto_loan: "card", other: "wallet",
};

export default function AccountsTab({ txns = [], reload }) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [txAccount, setTxAccount] = useState(null);

  async function load() {
    try { setAccounts(await api.listAccounts()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  const netWorth = useMemo(
    () => accounts.reduce((s, a) => {
      const v = acctValue(a);
      return s + (kindForGroup(accountGroup(a)) === "liability" ? -v : v);
    }, 0),
    [accounts]
  );

  const summary = useMemo(() => {
    let assets = 0, debt = 0;
    for (const a of accounts) {
      const v = acctValue(a);
      if (kindForGroup(accountGroup(a)) === "liability") debt += v;
      else assets += v;
    }
    return { assets, debt };
  }, [accounts]);

  const nwSeries = useMemo(
    () => netWorthSeries(txns || [], "month", accountsNetWorth(accounts)),
    [txns, accounts]
  );

  function openAdd() {
    setModal({ initial: { name: "", type: "chequing", institution: "other", balance: "", group: "", last4: "", icon: "" } });
  }
  function openEdit(a) {
    setModal({ initial: {
      id: a.id, name: a.name, type: a.type, institution: a.institution,
      balance: a.balance, group: accountGroup(a), last4: a.last4 || "", icon: a.icon || "",
    } });
  }
  async function submitModal(data) {
    try {
      if (modal.initial.id != null) await api.updateAccount(modal.initial.id, data);
      else await api.addAccount(data);
      setModal(null);
      load();
    } catch (e) { setError(e.message); }
  }
  async function remove(id) { await api.deleteAccount(id); load(); }

  const creditCount = accounts.filter((a) => kindForGroup(accountGroup(a)) === "liability").length;

  function renderRow(a) {
    const icon = ACCT_ICON[a.type] ?? "bank";
    if (a.type === "investment") {
      const growth = Number(a.growth || 0);
      const cost = Number(a.cost || 0);
      const growthPct = cost > 0 ? (growth / cost) * 100 : 0;
      const open = expandedId === a.id;
      return (
        <div key={a.id}>
          <div className="acct-row">
            <AccountBadge type={a.type} icon={a.icon} />
            <div className="acct-row-body">
              <span className="acct-row-name">{a.name}</span>
              <button className="link sm" onClick={() => setExpandedId(open ? null : a.id)} style={{ textAlign: "left" }}>
                {a.holdingsCount || 0} holding{(a.holdingsCount || 0) === 1 ? "" : "s"} {open ? "▲" : "▼"}
              </button>
            </div>
            <div className="acct-row-right">
              <span className="acct-row-bal">{fmt(acctValue(a), 2)}</span>
              <span className={"acct-row-chg " + (growth >= 0 ? "pos" : "neg")}>
                {growth >= 0 ? "+" : ""}{fmt(growth, 0)} ({growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%)
              </span>
            </div>
            <div className="acct-row-acts">
              <button className="acct-act-btn" title="Edit" onClick={() => openEdit(a)}><Icon name="pencil" /></button>
              <button className="acct-act-btn del" title="Delete" onClick={() => remove(a.id)}><Icon name="trash" /></button>
            </div>
          </div>
          {open && <div style={{ padding: "4px 6px 14px 52px" }}><InvestmentHoldings accountId={a.id} onChange={load} /></div>}
        </div>
      );
    }
    return (
      <div className="acct-row clickable" key={a.id} role="button" tabIndex={0}
        onClick={() => setTxAccount(a)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTxAccount(a); } }}>
        <AccountBadge type={a.type} icon={a.icon} />
        <div className="acct-row-body">
          <span className="acct-row-name">{a.name}</span>
          <span className="acct-row-meta">{typeLabel(a.type)}{a.last4 ? ` ···· ${a.last4}` : ""}</span>
        </div>
        <div className="acct-row-right">
          <span className={"acct-row-bal " + (acctValue(a) < 0 ? "neg" : "")}>{fmt(acctValue(a), 2)}</span>
        </div>
        <div className="acct-row-acts" onClick={(e) => e.stopPropagation()}>
          <button className="acct-act-btn" title="Edit" onClick={() => openEdit(a)}><Icon name="pencil" /></button>
          <button className="acct-act-btn del" title="Delete" onClick={() => remove(a.id)}><Icon name="trash" /></button>
        </div>
        <span className="acct-chev"><Icon name="chevR" /></span>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="page-sub">{accounts.length} account{accounts.length === 1 ? "" : "s"} · net worth {fmt(netWorth)}</p>
        </div>
        <div className="head-actions">
          <button className="btn primary sm" onClick={openAdd}><Icon name="plus" style={{ width: 15, height: 15 }} />Add account</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* KPI strip */}
      <div className="card">
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="kpi">
            <span className="kpi-label">Total assets</span>
            <span className="kpi-val">{fmt(summary.assets, 2)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Total liabilities</span>
            <span className="kpi-val neg">{fmt(summary.debt, 2)}</span>
            <span className="kpi-delta muted">{creditCount} credit account{creditCount === 1 ? "" : "s"}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Net worth</span>
            <span className={"kpi-val " + (netWorth >= 0 ? "" : "neg")}>{fmt(netWorth, 2)}</span>
          </div>
        </div>
      </div>

      {/* Net worth chart */}
      {nwSeries.length > 1 && (
        <div className="card widget">
          <div className="widget-head"><span className="widget-title">Net worth over time</span></div>
          <NetWorthChart data={nwSeries.map((s) => s.value)} labels={nwSeries.map((s) => s.label)} gradId="acctNwFill" lineId="acctNwLine" />
        </div>
      )}

      {/* Account groups */}
      {accounts.length === 0 ? (
        <div className="placeholder">
          <Icon name="bank" className="ph-ico" />
          <h2>No accounts yet</h2>
          <p>Add an account to start tracking your net worth.</p>
          <button className="btn primary sm" onClick={openAdd} style={{ marginTop: 8 }}>
            <Icon name="plus" style={{ width: 15, height: 15 }} />Add account
          </button>
        </div>
      ) : (
        GROUPS.map((g) => {
          const list = accounts.filter((a) => accountGroup(a) === g.key);
          if (list.length === 0) return null;
          const sub = list.reduce((s, a) => s + acctValue(a), 0);
          return (
            <div className="card widget" key={g.key}>
              <div className="widget-head">
                <span className="widget-title">{g.label}</span>
                <span className="group-sub muted">
                  {list.length} account{list.length === 1 ? "" : "s"}{" "}
                  <b className={g.kind === "liability" ? "neg" : ""}>{g.kind === "liability" && sub !== 0 ? "−" : ""}{fmt(sub, 2)}</b>
                </span>
              </div>
              <div className="acct-rows">{list.map(renderRow)}</div>
            </div>
          );
        })
      )}

      {modal && <AccountModal initial={modal.initial} onSubmit={submitModal} onClose={() => setModal(null)} />}
      {txAccount && <AccountTxModal account={txAccount} onClose={() => setTxAccount(null)} onChanged={() => { load(); reload?.(); }} />}
    </>
  );
}
