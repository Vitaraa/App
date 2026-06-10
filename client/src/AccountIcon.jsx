// Minimal line icons per account type. They draw with `currentColor` so they
// stay visible in both light and dark mode (the badge sets the color).

const ICONS = {
  bank: (
    <>
      <path d="M12 3l8 5H4z" />
      <path d="M5 8v10M9 8v10M15 8v10M19 8v10" />
      <path d="M3 21h18" />
    </>
  ),
  savings: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5h.01M18 14.5h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M3 16l5-5 4 4 8-8" />
      <path d="M16 7h4v4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>
  ),
  house: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  car: (
    <>
      <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
      <rect x="3" y="11" width="18" height="5" rx="1.5" />
      <circle cx="7.5" cy="16" r="1.4" />
      <circle cx="16.5" cy="16" r="1.4" />
    </>
  ),
  cap: (
    <>
      <path d="M22 9L12 5 2 9l10 4 10-4z" />
      <path d="M6 11v5c0 1 2.7 2 6 2s6-1 6-2v-5" />
    </>
  ),
  dollar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M14.5 9.2C14 8.5 13.1 8 12 8c-1.4 0-2.5.8-2.5 1.9 0 2.4 5 1.4 5 3.8 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2-.5-2.5-1.2" />
    </>
  ),
};

const TYPE_ICON = {
  chequing: "bank",
  savings: "savings",
  cash: "cash",
  investment: "chart",
  credit_card: "card",
  mortgage: "house",
  auto_loan: "car",
  student_loan: "cap",
  line_of_credit: "card",
  loan: "dollar",
  other: "dollar",
  other_asset: "dollar",
  other_liability: "dollar",
};

export default function AccountIcon({ type, size = 22 }) {
  const key = TYPE_ICON[type] || "dollar";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[key]}
    </svg>
  );
}
