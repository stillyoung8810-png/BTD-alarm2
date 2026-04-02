---
name: core-principles-btd
description: Enforces senior-level TypeScript/React and financial-domain standards for BTD-alarm (guards for money math, i18n via vrMessages, a11y, DRY/SRP/OCP, strict TS, async mutex and bridge error handling). Use when writing or reviewing code in this repository, when touching VR or finance flows, dashboards, React UI, Toss/web-bridge, or when the user mentions BTD standards, production readiness, or band-aid code.
---

# Core principles-btd

Apply these rules to **every** line written or modified in this project. Prefer guard clauses, explicit edge-case handling, and zero tolerance for lazy fixes.

## 1. Financial math and edge cases

- **Divide by zero:** Never divide by a variable without a guard or fallback. If `shares === 0`, handle the first step logically (e.g. `minOrderQty`); do not halt the business flow with a bare error return unless product requires it.
- **Order-generation loops:** In any `while`/`for` that emits financial orders, assert `price > 0`; if `price <= 0`, `break` immediately to avoid zero-price infinite loops (OOM).
- **Currency rounding:** Do not trust raw float math for money. Round with epsilon, e.g. `Math.round((val + Number.EPSILON) * 100) / 100` (adjust decimals to product rules).
- **Sign enforcement:** Do not trust raw inputs for financial deltas. Force magnitude and sign from business rules (e.g. withdrawals: `-Math.abs(...)`).
- **Validation:** Use the central `validateFinancialArgs` (or project equivalent). Avoid scattered `if (val < 0)` checks.

## 2. React and UI anti-patterns

- **No nested ternaries in JSX:** Never stack ternaries (`a ? b : c ? d : e`). Use a small helper with flat `if`/`return` or a map.
- **No effects in render:** Do not mutate `useRef.current` or run side effects in the render body; use `useEffect` (or event handlers) for side effects.
- **`useMemo`:** Use only for referential stability (heavy children) or genuinely expensive work—not for trivial ops on small data.
- **Default UI state:** Initialize `useState` from data when possible so the most relevant tab/view shows without an extra click.

## 3. I18n and hardcoding

- **No raw UI strings in JSX:** Do not hardcode Korean/English in components.
- **Single source:** Labels, messages, placeholders come from `constants/vrMessages.ts` (or the repo’s i18n dictionary).
- **No string-based logic:** Branch on IDs/keys, not translated text (e.g. not `if (title === 'VR 예약 주문')`).

## 4. Accessibility

For `onClick` on non-interactive elements (`div`, `span`, overlay, backdrop), also provide:

1. `role="button"`
2. `tabIndex={0}`
3. `onKeyDown` for Enter and Space
4. `aria-label` (or equivalent accessible name)

## 5. Architecture and DRY

- **OCP:** Extend behavior via new strategies, config, or isolated modules rather than sprinkling special cases through shared cores.
- **Data-driven UI:** Prefer config arrays (e.g. `TABLE_COLUMNS`) and `map` for repeated headers/cells; avoid copy-pasted markup per field.
- **Formatting:** Centralize currency/percent helpers; avoid repeated `.toLocaleString()` paste.
- **Isolation:** Before adding strategy logic to a global surface (e.g. dashboard), mirror how existing strategies (MA, multi-split, etc.) are isolated so new logic does not leak across strategies.

## 6. Clean code (mandatory)

- **DRY:** Before adding code, scan for duplication; extract after the second repetition (utils, hooks, components).
- **SRP:** One responsibility per function/component. Split fetch + heavy logic + UI into hooks and pure functions.
- **No dead code:** Remove unused imports, variables, props, and dead functions before finishing. Delete commented-out obsolete code; do not leave `// old code` blocks.
- **Complexity:** Max two levels of nested `if/else`; use early returns. Replace nested ternaries with `if`/`return` or lookup objects.
- **React:** Stable `key`s when lists reorder/mutate (not array index). No direct state mutation. Complete `useEffect`/`useCallback` dependency arrays. Avoid inline objects/functions in `map` when they force heavy memoized children to re-render.
- **Resilience:** Assume network failure and missing data. Use `?.` and `??`. Never white-screen: fallbacks, empty states, or explicit error UI for `null`/`undefined`/`[]`.

## 7. TypeScript

- **No `any`:** Use `unknown` and narrow with type guards.
- **Exhaustive `switch`:** Include `default` with a `never` exhaustiveness check on discriminated unions/enums.
- **No `!`:** Do not non-null assert; handle `null`/`undefined` with early return or defaults.

## 8. Naming and magic numbers

- **Booleans:** Prefix with `is`, `has`, `should`, or `can`.
- **Handlers:** Event handlers `handle*`; callback props `on*`.
- **Constants:** No unexplained literals in logic; use `SCREAMING_SNAKE` names at module top (e.g. `MAX_BUFFER_COUNT`, `PENDING_TIMEOUT_MS`).

## 9. Comments

- **No noise:** Do not comment what the code obviously does.
- **Explain why:** Business rules, math rationale, or non-obvious tradeoffs (e.g. `// 0-share deadlock: use minOrderQty as denominator on first entry`).

## 10. Performance and state

- **Colocation:** Keep state next to usage; do not lift to `Dashboard.tsx` if only `VrOrderModal.tsx` needs it.
- **Memoized children:** Prefer primitive props over huge objects. Avoid fresh object/function props per iteration in `map` for heavy children.

## 11. Async UI and domain safety

- **Missing i18n keys:** If a lookup is missing (e.g. `TDS_DIALOG_MESSAGES[lang]?.refund == null`), never bare `return` and trap the user. Close safely (`onClose`) or show the unified error path (`showErrorToast` or project equivalent).
- **Double-submit mutex:** For async financial or confirmation actions, `disabled`/`loading` alone is insufficient. Use a synchronous `useRef` mutex (e.g. `isExecutingRef.current`) to block duplicate requests across the repaint gap.
- **Bridge / dynamic imports:** Do not call external or bridge modules (e.g. Toss web-bridge) naked. Wrap with `await Promise.resolve(bridge.method(...))` so sync throws and async rejections both reach `catch` and error toast.
- **Stale closures:** Do not store executable callbacks in `useState`. Keep UI snapshots in state; keep action functions in `useRef` for financial flows.

## Quick verification (before finishing a change)

- Financial paths: guards, signs, rounding, loop breaks on bad price.
- UI: strings from i18n; interactive divs a11y-complete; no nested JSX ternaries.
- TS: no `any`/`!`; exhaustive switches where applicable.
- Async: mutex on money/confirm; bridge wrapped; missing i18n has fallback UX.

## Additional detail

For the full verbatim checklist aligned with workspace rules, see the project rule file `.cursor/rules/btdalarm.mdc` and keep skills vs rules in sync when principles change.
