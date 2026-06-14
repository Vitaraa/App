# Design Brief — "Claud" Budgeting Dashboard UI Overhaul

A ready-to-use brief for the design agent. Pair it with `UI-Audit.md` (current-state map). Fill the bracketed `[…]` fields where your intent matters — everything else is grounded in the actual codebase.

---

## 1. The product in one line

A personal finance dashboard ("Claud") where an individual tracks accounts, transactions, budgets, investments, and a long-range net-worth projection ("Foresight"), behind a personal login.

## 2. Goal of this overhaul

> **[State your one-sentence goal. e.g. "Make it feel like a premium, modern fintech product — confident, calm, and trustworthy — without losing the data density power users rely on."]**

Secondary goals (edit as needed):

- Formalize the design system: add the missing **radius, type, spacing, and elevation** token scales (currently only color is tokenized).
- Bring the **light theme** to parity with dark (it lacks an elevation system today).
- Add **purposeful motion** for state changes (hover, focus, tab switches) — the UI is nearly static now.

## 3. Audience & feeling

- **Who:** [individual users managing their own money — likely financially engaged, comfortable with dense dashboards].
- **Feeling to evoke:** [e.g. trustworthy, calm, precise — not playful/gamified]. Money apps live or die on perceived trust; clarity beats decoration.

## 4. Brand & visual constraints

- **Keep / change accent:** current accent is indigo `#6366f1`. [Keep it / move to ____].
- **Semantic colors:** green = positive, red = negative are load-bearing across charts and figures — keep semantically, refine the exact hues if desired.
- **Typeface:** currently `system-ui` only. [Keep system fonts for speed / introduce a brand UI typeface such as ____].
- **Dark vs light:** dark is the default today. [Keep dark-default / make light the hero / treat equally].
- **Hard constraints:** must stay a single global `index.css` + React class names (no CSS-in-JS migration); must not break Recharts theming. [Add any others.]

## 5. Scope

**In scope (recommended phase 1 — the visual language):**

1. **Token foundation** — expand `:root` / `[data-theme]` with radius, spacing, type-scale, and elevation tokens; refactor existing rules to consume them.
2. **App shell** — sidebar, page header, user menu.
3. **Dashboard widgets** (`Home.jsx` + `widgets/*`) — the most reusable surface; sets the tone for cards, figures, and charts.

**In scope (phase 2 — validate against complexity):**

4. **Accounts** and **Foresight** tabs — the densest, most interactive screens; prove the language holds up under real data and inline editing.

**Phase 3:** remaining tabs (Transactions, Cash Flow, Budget, Investments) and auth screens.

**Out of scope (unless you say otherwise):** backend/API, data model, feature changes, component refactors of the large files. This is a *visual* overhaul, not a rewrite.

## 6. References

> **[Drop 2–4 products whose UI you admire and a word on why — e.g. "Monarch Money (clean hierarchy), Linear (motion + density), Mercury (calm fintech trust). Avoid: anything gamified or cluttered."]**

## 7. Output contract (how the agent should deliver)

Recommended given this repo's setup:

1. **Direction first, in Figma.** Generate 1–2 flagship screens (Dashboard + one dense tab) in Figma using the connected Figma integration. Review and lock the visual language before any code changes.
2. **Then implement on a branch.** Land the agreed language primarily through `client/src/index.css` (token additions + rule updates), touching JSX only where class names must change. Open a PR against `main` — do not commit directly.
3. **Deliverables:** updated token block, restyled CSS, before/after screenshots per screen, and a short changelog of class/markup changes.

**Guardrails:** work on a branch, never force-push `main`; keep both themes working at every step; no new runtime dependencies without flagging.

## 8. Definition of done

- New token scales (radius, type, spacing, elevation) defined and consumed; the ad hoc values catalogued in the audit are gone.
- Light and dark themes both polished, including elevation.
- The 1–2 flagship screens approved, then rolled out per the phasing above.
- No regressions in Recharts visuals or the existing theme toggle.

---

### Quick-start prompt for the design agent

> "Overhaul the UI of the Claud budgeting dashboard (React + Vite, styling in `client/src/index.css`). Read `UI-Audit.md` and this brief first. Phase 1: define radius/type/spacing/elevation tokens and restyle the app shell + dashboard widgets to achieve [GOAL], referencing [REFERENCES]. Propose the visual direction in Figma for the Dashboard and the Foresight tab before changing code, then implement on a branch via `index.css`. Keep both light and dark themes working and don't break Recharts."
