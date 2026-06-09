// Presets for the Accounts tab: Canadian financial-institution badges (colored
// monograms — not official logos) and account types with their net-worth sign.

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

// Each account type maps to a net-worth sign: assets add, liabilities subtract.
export const ACCOUNT_TYPES = [
  { key: "chequing", label: "Chequing", kind: "asset" },
  { key: "savings", label: "Savings", kind: "asset" },
  { key: "investment", label: "Investment", kind: "asset" },
  { key: "cash", label: "Cash", kind: "asset" },
  { key: "other_asset", label: "Other asset", kind: "asset" },
  { key: "credit_card", label: "Credit Card", kind: "liability" },
  { key: "mortgage", label: "Mortgage", kind: "liability" },
  { key: "auto_loan", label: "Auto Loan", kind: "liability" },
  { key: "line_of_credit", label: "Line of Credit", kind: "liability" },
  { key: "student_loan", label: "Student Loan", kind: "liability" },
  { key: "loan", label: "Other Loan", kind: "liability" },
  { key: "other_liability", label: "Other liability", kind: "liability" },
];

export function institutionFor(key) {
  return INSTITUTIONS.find((i) => i.key === key) || INSTITUTIONS[INSTITUTIONS.length - 1];
}
export function typeFor(key) {
  return ACCOUNT_TYPES.find((t) => t.key === key);
}
export function typeLabel(key) {
  const t = typeFor(key);
  return t ? t.label : "Account";
}
export function kindForType(type, fallback = "asset") {
  const t = typeFor(type);
  return t ? t.kind : fallback;
}
