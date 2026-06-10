// Presets for the Accounts tab: Canadian financial-institution badges (colored
// monograms — not official logos), account types, and display groups.

export const INSTITUTIONS = [
  { key: "rbc", label: "RBC", abbr: "RBC", bg: "#0051A5", fg: "#FEDF01" },
  { key: "td", label: "TD", abbr: "TD", bg: "#008A00", fg: "#FFFFFF" },
  { key: "cibc", label: "CIBC", abbr: "CIBC", bg: "#B3242B", fg: "#FFC72C" },
  { key: "bmo", label: "BMO", abbr: "BMO", bg: "#0079C1", fg: "#FFFFFF" },
  { key: "scotiabank", label: "Scotiabank", abbr: "BNS", bg: "#EC111A", fg: "#FFFFFF" },
  { key: "nbc", label: "National Bank", abbr: "NBC", bg: "#E51A4B", fg: "#FFFFFF" },
  { key: "tangerine", label: "Tangerine", abbr: "TNG", bg: "#FF6200", fg: "#FFFFFF" },
  { key: "desjardins", label: "Desjardins", abbr: "DSJ", bg: "#00874E", fg: "#FFFFFF" },
  { key: "simplii", label: "Simplii", abbr: "SMP", bg: "#EE3124", fg: "#FFFFFF" },
  { key: "eqbank", label: "EQ Bank", abbr: "EQ", bg: "#5B2D8E", fg: "#FFFFFF" },
  { key: "wealthsimple", label: "Wealthsimple", abbr: "WS", bg: "#1A1A1A", fg: "#FFFFFF" },
  { key: "questrade", label: "Questrade", abbr: "QT", bg: "#1F4E9D", fg: "#FFFFFF" },
  { key: "vancity", label: "Vancity", abbr: "VC", bg: "#E4002B", fg: "#FFFFFF" },
  { key: "coastcapital", label: "Coast Capital", abbr: "CCS", bg: "#003B71", fg: "#FFFFFF" },
  { key: "manulife", label: "Manulife", abbr: "MFC", bg: "#00A758", fg: "#FFFFFF" },
  { key: "other", label: "Other", abbr: "—", bg: "#2A2F3A", fg: "#9AA3B2" },
];

// Display groups. The group also determines net-worth sign (asset/liability).
export const GROUPS = [
  { key: "cash", label: "Cash", kind: "asset" },
  { key: "investments", label: "Investments", kind: "asset" },
  { key: "credit_cards", label: "Credit Cards", kind: "liability" },
  { key: "loans", label: "Loans", kind: "liability" },
];

// Account types shown in the add form. `group` is the default display group;
// "other" has no fixed group — the user picks one when adding it.
export const ACCOUNT_TYPES = [
  { key: "chequing", label: "Chequing", group: "cash" },
  { key: "savings", label: "Savings", group: "cash" },
  { key: "cash", label: "Cash", group: "cash" },
  { key: "investment", label: "Investment", group: "investments" },
  { key: "credit_card", label: "Credit Card", group: "credit_cards" },
  { key: "mortgage", label: "Mortgage", group: "loans" },
  { key: "line_of_credit", label: "Line of Credit", group: "loans" },
  { key: "student_loan", label: "Student Loan", group: "loans" },
  { key: "auto_loan", label: "Auto Loan", group: "loans" },
  { key: "other", label: "Other", group: "" },
];

// type -> default group (also covers legacy other_asset / other_liability).
const TYPE_GROUP = {
  chequing: "cash", savings: "cash", cash: "cash", other_asset: "cash",
  investment: "investments",
  credit_card: "credit_cards",
  mortgage: "loans", auto_loan: "loans", line_of_credit: "loans",
  student_loan: "loans", loan: "loans", other_liability: "loans",
};

export function institutionFor(key) {
  return INSTITUTIONS.find((i) => i.key === key) || INSTITUTIONS[INSTITUTIONS.length - 1];
}
export function groupForType(type) {
  return TYPE_GROUP[type] || "cash";
}
export function groupFor(key) {
  return GROUPS.find((g) => g.key === key) || GROUPS[0];
}
export function kindForGroup(group) {
  const g = GROUPS.find((x) => x.key === group);
  return g ? g.kind : "asset";
}
// An account's effective group: the stored group, else derived from its type.
export function accountGroup(a) {
  return a.account_group || groupForType(a.type);
}
export function typeLabel(key) {
  const t = ACCOUNT_TYPES.find((x) => x.key === key);
  if (t) return t.label;
  if (key === "other_asset" || key === "other_liability") return "Other";
  return "Account";
}
