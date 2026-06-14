# UI Audit — "Claud" Budgeting Dashboard

**Repo:** `github.com/vitaraa/app` · branch `main` · client v1.6.0
**Stack:** React 18 + Vite 6, Recharts for charts, single global stylesheet (`client/src/index.css`)
**Audited:** 2026-06-13

This document captures the current state of the UI so a design agent has a faithful baseline to work from. The headline: the codebase is unusually well-suited to a restyle, because styling is centralized and token-driven rather than scattered through the components.

---

## 1. Architecture at a glance

The app is a single-page dashboard behind login. `Dashboard.jsx` is the shell: a fixed **sidebar** (brand, tab nav, user menu) plus a **main** column with a page header and the active tab's content.

Seven primary tabs:

| Tab | Component | Notes |
|---|---|---|
| Dashboard | `Home.jsx` + `widgets/*` | Customizable widget grid (net worth, spending, insights, goals, recent, investments, subscriptions) |
| Accounts | `AccountsTab.jsx` (560 lines) | Largest screen; account list + inline transaction editing |
| Transactions | `Transactions.jsx` | Table with categorization |
| Cash Flow | `CashFlowTab.jsx` | |
| Budget | `BudgetTab.jsx` | Income/expense card, goals |
| Investments | `InvestmentsTab.jsx` + `InvestmentHoldings.jsx` | |
| Foresight | `ForesightTab.jsx` (860 lines) | Net-worth projection / planning |

Auth + utility screens: `Login.jsx`, `ResetPassword.jsx`, `VerifyEmail.jsx`.

## 2. Styling approach — the good news

The styling is **clean and centralized**, which is the single biggest factor in how smoothly a redesign will go:

- **One stylesheet:** all visual styling lives in `client/src/index.css` (~2,170 lines, ~245 classes).
- **Class-based, not inline:** 541 `className` usages vs. only **4** inline `style={{…}}` instances (in `BudgetTab`, `GoalsWidget`, `ForesightTab`). Almost everything can be restyled by editing CSS alone — minimal JSX churn.
- **CSS custom properties already in place:** a `:root` token block drives color, with a full `[data-theme="light"]` override. Theme switching already works and persists.

Current color tokens:

```
--bg / --card / --border / --text / --muted
--green / --red / --accent (#6366f1 indigo)
--hover / --sidebar / --input-bg
```

Dark is the default (`--bg: #0f1115`, `--card: #181b22`); a light theme is fully defined.

## 3. Where it's inconsistent — the redesign opportunities

The foundation is solid but the system is **incomplete**. Tokens exist for *color* only; everything else is ad hoc. This is exactly what a design pass should formalize:

- **No radius scale.** Nine different `border-radius` values are used (5, 6, 7, 8, 9, 10, 12, 14px, plus 999). Should collapse to ~3–4 tokens (`--radius-sm/md/lg/pill`).
- **No type scale.** 15+ distinct `font-size` values in `rem` with no rhythm (0.72, 0.74, 0.76, 0.78, 0.8, 0.82, 0.85, 0.86, 0.88, 0.9, 0.95, 1, 1.4, 1.5, 2…). A defined scale would tighten hierarchy considerably.
- **No spacing scale.** Padding/margins are hand-set per rule rather than drawn from a token set.
- **Elevation is dark-only.** All six `box-shadow` declarations are tuned for the dark theme (heavy black alphas); the light theme has effectively no elevation system.
- **Sparse motion.** Only 3 transition/animation references in the whole stylesheet — the UI feels static. Hover/focus/state transitions are an easy, high-impact win.
- **Single system font.** `system-ui` stack only; no brand typeface or display/UI distinction.

## 4. Component-level notes

- The widget system (`Home.jsx` + `widgets/`) is the most reusable, "design-system-ready" part — good place to anchor a new visual language.
- `ForesightTab.jsx` (860) and `AccountsTab.jsx` (560) are large files mixing data logic and markup. A redesign doesn't require refactoring them, but the design agent should be aware these two screens carry the most layout complexity and edge cases (inline editing, projection tables).
- No component library / Storybook and no CSS-in-JS — the restyle surface is one file plus occasional JSX class tweaks.

## 5. Implications for the handoff

1. **Restyling is low-risk.** Because color is already tokenized and styling is class-based, a new visual language can largely land in `index.css` by (a) expanding the token set and (b) updating class rules — without rewriting components.
2. **Establish the missing scales first.** Radius, type, spacing, and elevation tokens should be defined before visual work, so the redesign is systematic rather than per-screen.
3. **Light theme needs real attention.** It exists but lacks an elevation/shadow system; treat it as a first-class deliverable, not an afterthought.
4. **Start narrow.** Dashboard widgets + the sidebar shell establish the language; Accounts and Foresight are the stress tests to validate it against dense, interactive layouts.
