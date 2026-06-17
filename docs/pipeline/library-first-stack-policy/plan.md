# Plan: Library-first stack policy — remaining library adoptions (post-Vite-migration)

This is requirement #3 (`requirements/library-first-stack-policy.md`): a standing stack policy **plus** the
concrete remaining library additions/refactors it mandates. **The stack has already migrated** to
Vite + React SPA + a thin Hono API (requirement #5, committed). This plan is re-scoped to that reality.

> **Post-migration correction.** The previously-approved version of this plan was written **pre-migration**
> (it assumed Next.js 15, `src/app/layout.tsx`, route handlers, `@next/bundle-analyzer`). Those rows are now
> obsolete. **Already done by the migration and explicitly NOT re-planned here:** Next→Vite+Hono; client data
> on **TanStack Query** (`src/features/roadmap/hooks/useTournamentQuery.ts` already replaces the hand-rolled
> `fetch`+`setInterval`); the `QueryClientProvider` boundary (`src/main.tsx` + `src/lib/queryClient.ts`);
> `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` installed and wired; **Tailwind v4**
> (`@import 'tailwindcss'` + `@theme` tokens in `src/styles/global.css`) as the single styling system. This
> plan covers **only** the library-first work that genuinely remains.

## Scope

### In scope (the actual remaining work)

1. **Date/time + timezone → date-fns + date-fns-tz.** Add both deps. Route **all** kickoff/timezone rendering
   through one consistent path. Replace the three hand-rolled `Intl.DateTimeFormat(undefined, …)` calls in
   `src/features/roadmap/format.ts` (grep-confirmed the **only** Intl date usage in `src/`) with a new
   `src/lib/datetime.ts` façade over `date-fns-tz` `formatInTimeZone` + `date-fns` `parseISO`. The three
   consumers — `src/components/nodes/MatchNode.tsx`, `src/components/nodes/StatusPill.tsx`,
   `src/components/panel/MatchDetailPanel.tsx` — all import from `format.ts`, so the refactor is isolated to
   `format.ts` (kept as a thin re-export barrel). Pick **date-fns only** — never also luxon/moment/dayjs.
2. **Tree / bracket layout lib → d3-hierarchy (dependency only).** Add `d3-hierarchy` + `@types/d3-hierarchy`
   now so the next phase (req #2, per-match orientation) can build the bracket tree on it. **Do not build the
   hierarchy here** — that is req #2's job. Prove the install/type-resolution with a minimal smoke test
   (`src/lib/d3-hierarchy.smoke.test.ts`). No production wrapper module is shipped. (No Dagre exists in
   `package.json` to remove — "supersedes Dagre" is satisfied by never adding it.)
3. **Icons → lucide-react.** Add `lucide-react`. Replace the only literal-glyph icon in `src/` — the close
   `✕` at `src/components/panel/MatchDetailPanel.tsx:95` — with an accessible lucide `<X aria-hidden />`
   inside the existing `aria-label="Close match details"` button. (Grep-confirmed: no chevrons / inline
   `<svg>` / other icon glyphs exist elsewhere; the `Flag` monogram fallback is a placeholder, not an icon,
   and is out of scope.)
4. **`@testing-library/user-event` → add (missing).** Add the devDep so component tests use realistic
   Testing Library interactions (e.g. `userEvent.click` for the close button) instead of synthetic
   `fireEvent`. `@testing-library/react` + `jest-dom` + `jsdom` are already installed.
5. **Prettier + prettier-plugin-tailwindcss → add.** Add `prettier`, `prettier-plugin-tailwindcss`, a
   `.prettierrc` (matching existing style: single quotes, semicolons, `printWidth: 100`), a `.prettierignore`,
   and `format` / `format:check` scripts. Run formatting so Tailwind class order is consistent across the
   tree.
6. **framer-motion → DEFER (do not add a dependency with no consumer).** There is no clear non-graph
   animation use today: the only non-graph animation is the `MatchDetailPanel` slide, already implemented with
   a compositor-only CSS `transition-transform` (`MatchDetailPanel.tsx:79`) that satisfies the requirement and
   honors the always-mounted `inert`/`aria-hidden` contract. React Flow already owns all graph motion. Per the
   requirement's explicit anti-bloat instruction, framer-motion is **noted as available-but-deferred** and
   **not** added (no speculative dependency). Recorded in Risks with the trigger that would justify adding it.
7. **Single-concern / single-styling enforcement (verification).** Audit `package.json` so no two libraries
   solve one concern (one date lib, native `fetch` only behind TanStack Query — no axios/ky). Confirm Tailwind
   v4 is the only styling system (already true: `src/styles/global.css` is the sole app stylesheet; the rest
   is React Flow vendor CSS). Record the audit note; no code change unless a violation surfaces.
8. **Test harness touch-up.** The Vitest config already includes `*.test.tsx` and uses a per-file
   `// @vitest-environment jsdom` pragma (see `useTournamentQuery.test.tsx`). New `.tsx` component tests follow
   the **same per-file pragma pattern** — no `environmentMatchGlobs` change needed. Extend `coverage.include`
   to add `src/lib/datetime.ts`. Add a tiny `vitest.setup.ts` only if a global `jest-dom` matcher registration
   - `afterEach(cleanup)` is wanted; otherwise import `@testing-library/jest-dom/vitest` per test file (decide
     in implementation; prefer the shared setup file to avoid per-file boilerplate).
9. **E2E determinism for the date refactor.** Pin `use.timezoneId: 'UTC'` and `use.locale: 'en-US'` in the
   shared `use` block of `playwright.config.ts` so kickoff text is reproducible across machines/CI, then
   regenerate the four committed desktop snapshots (`e2e/visual.spec.ts-snapshots/roadmap-{320,768,1024,1440}-chromium-darwin.png`)
   via `npm run test:e2e:update` and human-review the kickoff-text diff.
10. **package.json hygiene.** Reflect the stack map with no duplicate-concern deps and add only the scripts
    listed above.
11. **Follow-up: finish doc gaps.** `requirements/zoomable-roadmap-graph.md` still says "Use React Flow +
    **Dagre**", "Next also acceptable", and CSS-`tokens.css` styling. Update it to: Dagre → **d3-hierarchy**;
    styling → **Tailwind v4 `@theme` tokens**; live data → **TanStack Query**; kickoff display → **the tz
    lib**; reconcile the framework note to the **locked Vite + React SPA + Hono** reality. Confirm
    `requirements/library-first-stack-policy.md`'s stack map matches the post-migration state (mostly done by
    the migration; close any residual gaps, e.g. mark the framer-motion row "deferred — no consumer").

### Out of scope (explicit)

- **Re-doing the migration.** Next→Vite+Hono, the TanStack Query client-fetch rewrite, the
  `QueryClientProvider` boundary, Tailwind v4, and the `@testing-library/react`/`jest-dom`/`jsdom` installs are
  **already done and committed**. This plan does **not** touch `useTournamentQuery.ts`,
  `src/lib/queryClient.ts`, or `src/main.tsx`'s provider wiring beyond what the date/icon refactor incidentally
  requires (nothing).
- **framer-motion is NOT added** (no consumer — see scope #6). No speculative dependency.
- **No d3 hierarchy/bracket construction here.** d3-hierarchy is added as a dependency + smoke test only;
  req #2 (`docs/pipeline/per-match-nodes-and-orientation/`) owns building the bracket tree on it. No
  `d3-bracket-adapter` / `bracketHierarchy` wrapper is shipped (it would be unused and would pre-commit an API
  req #2 builds inline).
- **Domain logic stays hand-written (non-goals).** `computeGroups`/standings (`src/domain/bracket/standings.ts`),
  `buildBracket` topology (`src/domain/bracket/build-bracket.ts`), `R32_SEEDING` (`src/domain/bracket/seeding.ts`),
  `stage-order` (`src/domain/bracket/stage-order.ts`), and the deterministic mock simulator
  (`src/data/providers/mock/build-mock-tournament.ts`: `mulberry32` PRNG, Poisson `drawGoals`, `decide`) are
  **not** library-ized. The mock's `iso()` builder (`Date.UTC(...).toISOString()`, line 38) **constructs an
  instant**, it does not format display text → correctly excluded from the date refactor.
- **shadcn/ui, Zustand, nuqs → not added.** Optional/only-if-needed. `useStageView` already does URL state by
  hand correctly; React Flow owns its internal Zustand. Flagged as justified-but-optional follow-ups, not
  forced.
- **User-facing error UI.** `RoadmapCanvas.tsx:62` destructures only `{ data, loading }`; the hook still
  returns `error` for a future task. Wiring a visible error surface is out of scope.
- **No new domain fields** (e.g. venue timezone). `Venue` has only `name`/`city`; tz rendering uses an explicit
  default zone (`'UTC'`), not a per-venue zone the model lacks.

## Approach

Adopt the remaining canonical libraries **surgically, one concern at a time**, exploiting the codebase's
existing single-funnel boundaries so each diff stays small and the suite stays green. `format.ts` is already
the single date façade imported by all three kickoff consumers; the date change therefore touches only
`format.ts` + a new `src/lib/datetime.ts`. The `✕` glyph lives in exactly one file, so the icon swap is a
one-component change. Prettier is purely additive tooling. d3-hierarchy is dep + smoke-test only.

**Dates:** create `src/lib/datetime.ts` exporting `formatDateTime`/`formatTime`/`formatDate` that call
`formatInTimeZone(parseISO(iso), resolveTimeZone(tz), <token>)` against an **explicit default IANA zone
(`'UTC'`)**, preserving the current null fallbacks (`'Date TBD'`/`'--:--'`/`'TBD'`). `format.ts` becomes a thin
barrel re-exporting them, so the three consumers need zero call-site churn. This intentionally swaps the
machine-zone/machine-locale `Intl` behavior (the non-determinism this refactor removes) for a deterministic
explicit-zone, fixed-locale render of the **same visible shape** (`dd MMM, HH:mm`).

**Icons:** import `{ X }` from `lucide-react`, render `<X aria-hidden size={16} />` as the button's only child;
the button keeps `aria-label="Close match details"` as its accessible name, so the e2e/a11y contract is
unchanged.

**d3-hierarchy:** add the dep + `@types/d3-hierarchy`; write a <30-line smoke test asserting
`hierarchy(tinyTree, accessor).leaves().length` and `.height` to prove the package and its types resolve in the
Vite/Vitest build. Real bracket→tree construction is left to req #2 where it is already designed.

**Rejected alternative (dates):** Luxon instead of date-fns. Both are canonical; the stack map names date-fns
as the pick (Luxon only as the acceptable alternative — "pick one, don't ship both"). date-fns is
tree-shakeable (smaller SPA bundle) and pairs cleanly with `date-fns-tz`, so we follow the map's primary pick.

**Rejected alternative (animation):** adding framer-motion now and migrating the panel slide onto a persistent
`motion.aside`. Rejected: the existing compositor-only CSS transition already meets the requirement, React Flow
owns graph motion, and the requirement explicitly forbids adding a dependency with no clear consumer. Adding it
would be pure bundle bloat against the SPA budget.

## Files

| Path                                                                           | Action           | Responsibility                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                                 | modify           | Add deps: `date-fns`, `date-fns-tz`, `lucide-react`. Add devDeps: `d3-hierarchy`, `@types/d3-hierarchy`, `@testing-library/user-event`, `prettier`, `prettier-plugin-tailwindcss`. Add scripts `format` (`prettier --write .`) + `format:check` (`prettier --check .`). **Do NOT add framer-motion** (deferred). Verify no duplicate-concern deps (one date lib; native fetch only). |
| `src/lib/datetime.ts`                                                          | create           | New single date/timezone façade. Exports `resolveTimeZone(explicit?)`, `formatDateTime(iso, tz?)`, `formatTime(iso, tz?)`, `formatDate(iso, tz?)`. Wraps `date-fns-tz` `formatInTimeZone` + `date-fns` `parseISO`. Null ISO → existing fallbacks. Pure, no React. Explicit error handling: guards null/empty ISO before `parseISO`. <120 lines.                                      |
| `src/features/roadmap/format.ts`                                               | modify           | Becomes a thin barrel: `export { formatDateTime, formatTime, formatDate } from '@/lib/datetime';`. Drops all `Intl.DateTimeFormat`/`new Date()`. The three importers keep working with zero call-site change.                                                                                                                                                                        |
| `src/components/panel/MatchDetailPanel.tsx`                                    | modify           | Replace the `✕` text (line 95) with lucide `<X aria-hidden size={16} />` (`import { X } from 'lucide-react'`). Keep the button's `aria-label="Close match details"`, `onClose`, and styling. **No animation library change** — the existing CSS `transition-transform` + `inert`/`aria-hidden` contract (lines 69–83) is untouched.                                                  |
| `src/lib/datetime.test.ts`                                                     | create           | Unit tests (node): explicit-zone golden strings, null fallbacks, two-zone divergence.                                                                                                                                                                                                                                                                                                |
| `src/lib/d3-hierarchy.smoke.test.ts`                                           | create           | Smoke test (node): `import { hierarchy } from 'd3-hierarchy'`; assert `hierarchy(tinyTree, accessor).leaves().length` + `.height` to prove the dep + `@types/d3-hierarchy` install/resolve. <30 lines. No bracket reconstruction (that is req #2).                                                                                                                                   |
| `src/components/panel/MatchDetailPanel.test.tsx`                               | create           | Component test (jsdom, per-file `// @vitest-environment jsdom` pragma): close button accessible name `"Close match details"` invokes `onClose` via `@testing-library/user-event`; lucide `X` is `aria-hidden`; kickoff row renders text from the façade; panel queryable by role `complementary` / name `"Match details"` and toggles `aria-hidden` with `open`.                     |
| `vitest.setup.ts`                                                              | create           | Import `@testing-library/jest-dom/vitest`; register `afterEach(cleanup)` from `@testing-library/react`. <20 lines. (Referenced from `vitest.config.ts` `setupFiles`.)                                                                                                                                                                                                                |
| `vitest.config.ts`                                                             | modify           | Add `setupFiles: ['./vitest.setup.ts']`. Extend `coverage.include` with `src/lib/datetime.ts`. (No `include`/`environmentMatchGlobs` change — `*.test.tsx` already included; per-file jsdom pragma already the pattern.)                                                                                                                                                             |
| `playwright.config.ts`                                                         | modify           | Add `timezoneId: 'UTC'` and `locale: 'en-US'` to the shared `use` block so kickoff text is deterministic. (Shared `use.timezoneId`/`use.locale` override the `mobile` project's `devices['iPhone 13']` descriptor on every project.)                                                                                                                                                 |
| `.prettierrc`                                                                  | create           | `{ "singleQuote": true, "semi": true, "printWidth": 100, "plugins": ["prettier-plugin-tailwindcss"] }` to match existing code style.                                                                                                                                                                                                                                                 |
| `.prettierignore`                                                              | create           | Ignore `node_modules`, `dist`, `coverage`, `*.snap`, `e2e/**/*-snapshots`, `*.png`.                                                                                                                                                                                                                                                                                                  |
| `e2e/visual.spec.ts-snapshots/roadmap-{320,768,1024,1440}-chromium-darwin.png` | regenerate       | Re-baseline the four desktop breakpoint screenshots via `npm run test:e2e:update` after the date refactor + tz pin; human-review the kickoff-text diff.                                                                                                                                                                                                                              |
| `requirements/zoomable-roadmap-graph.md`                                       | modify           | Dagre → d3-hierarchy; CSS tokens → Tailwind v4 `@theme`; add TanStack Query (live data) + tz lib (kickoff); reconcile "Next also acceptable" to the locked Vite+React+Hono stack.                                                                                                                                                                                                    |
| `requirements/library-first-stack-policy.md`                                   | modify (if gaps) | Confirm the stack map matches post-migration reality; mark the framer-motion row "deferred — no consumer"; ensure no row still implies Next.js.                                                                                                                                                                                                                                      |

## Data Model / Types

No domain model changes. Boundary types are unchanged (`Tournament`, `Match`, `ApiEnvelope<T>`, Zod
`tournamentSchema`). The TanStack Query hook (`useTournamentQuery`) and its `{ data, loading, error }` contract
are **already in place** and not modified. Only new library-facing signatures are introduced.

### Date façade (`src/lib/datetime.ts`)

The current `Intl.DateTimeFormat(undefined, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })`
produces e.g. `02 Jun, 14:30` but is **machine-zone + machine-locale dependent** (exactly the non-determinism
this refactor removes). The refactor **intentionally** changes the contract to a deterministic explicit-zone,
fixed-locale render of the same visible shape. The chosen tokens reproduce the shape; the wall-clock value now
resolves against an explicit zone — so the rendered bytes are **not guaranteed identical** to the committed
snapshots, which is why the visual baseline must be regenerated.

```ts
// src/lib/datetime.ts
const DEFAULT_TZ = 'UTC'; // fixed broadcast zone (decision below)
const FMT_DATETIME = 'dd MMM, HH:mm'; // e.g. "02 Jun, 14:30" (mirrors prior Intl shape)
const FMT_TIME = 'HH:mm'; // e.g. "14:30"
const FMT_DATE = 'dd MMM'; // e.g. "02 Jun"

export function resolveTimeZone(explicit?: string): string; // explicit ?? DEFAULT_TZ
export function formatDateTime(iso: string | null, tz?: string): string; // 'Date TBD' on null/invalid
export function formatTime(iso: string | null, tz?: string): string; // '--:--'   on null/invalid
export function formatDate(iso: string | null, tz?: string): string; // 'TBD'     on null/invalid
// Impl: formatInTimeZone(parseISO(iso), resolveTimeZone(tz), <FMT>)
```

**Production default zone decision:** default to a **fixed broadcast zone `'UTC'`**, not the viewer's resolved
zone. Rationale: (a) the app has no per-venue timezone field, so "venue-local" is impossible; (b) a fixed zone
makes both production output and the E2E visual snapshots fully deterministic regardless of the viewer's
machine; (c) it is trivially overridable per call via the `tz` argument when a future task adds user/venue zone
support. Playwright's `use.timezoneId: 'UTC'` matches this default so the regenerated snapshots are
reproducible. Unit-test golden strings assert the explicit-zone path (`formatDateTime(iso, 'UTC')` and a second
zone), never the ambient machine zone.

### d3-hierarchy (dependency, no app types)

Added as a dependency consumed by req #2. This req exposes **no** bracket-hierarchy types or functions. The
only artifact is the smoke test, which uses `d3-hierarchy`'s own `hierarchy()` / `HierarchyNode<T>` types on a
throwaway inline datum:

```ts
// src/lib/d3-hierarchy.smoke.test.ts (shape)
import { hierarchy } from 'd3-hierarchy';
// tiny inline tree { id, children } → hierarchy(root, n => n.children)
// assert root.leaves().length and root.height to prove the package + types resolve.
```

### Icon (lucide-react)

```tsx
import { X } from 'lucide-react';
// <X aria-hidden size={16} />  — decorative; button's aria-label is the accessible name.
```

## Test Strategy

Framework: **Vitest** (node domain suite, unchanged) + **Vitest + Testing Library** for `.tsx` component tests
(per-file `// @vitest-environment jsdom` pragma, matching the existing `useTournamentQuery.test.tsx`). E2E stays
on **Playwright**; existing specs must remain green with the visual baseline regenerated.

### Behaviors to test (unit / component)

1. **datetime façade (`src/lib/datetime.test.ts`, node):**
   - `formatDateTime('2026-06-02T14:30:00.000Z', 'UTC')` → exact golden `'02 Jun, 14:30'`;
     `formatTime(.., 'UTC')` → `'14:30'`; `formatDate(.., 'UTC')` → `'02 Jun'`.
   - The **same** UTC instant formatted in `'UTC'` vs `'America/New_York'` yields **different** wall-clock
     times (proves `date-fns-tz` is wired, not `Intl`-default machine zone).
   - Null/empty input → `'Date TBD'` / `'--:--'` / `'TBD'`.
   - `resolveTimeZone(undefined)` → `'UTC'`; `resolveTimeZone('Asia/Tokyo')` → `'Asia/Tokyo'`.
2. **d3-hierarchy smoke (`src/lib/d3-hierarchy.smoke.test.ts`, node):**
   - `hierarchy(<tiny inline tree>, accessor).leaves().length` and `.height` return expected values, proving
     `d3-hierarchy` + `@types/d3-hierarchy` are installed and type-resolve. Install proof, **not** a bracket
     reconstruction test (that lives in req #2).
3. **MatchDetailPanel (`MatchDetailPanel.test.tsx`, jsdom):**
   - Close button has accessible name `"Close match details"` and invokes `onClose` on
     `userEvent.click` (lucide `X` is `aria-hidden`, so the name comes from the button's `aria-label`).
   - Kickoff `MetaRow` renders text from the date façade for a given match (asserts the deterministic
     explicit-zone output, not a machine-zone value).
   - Panel is queryable by role `complementary` / name `"Match details"`; toggles `aria-hidden`
     (`false` when `matchId` set, `true` when null) — guards the always-mounted accessibility contract at the
     component level.
4. **Regression guard (existing suites pass unchanged):** the node domain/data tests
   (`standings.test.ts`, `build-bracket.test.ts`, `build-graph.test.ts`, `lod.test.ts`,
   `bracket-layout.test.ts`, `build-mock-tournament.test.ts`, `mapper.test.ts`,
   `server/routes/worldcup.test.ts`) and the existing `useTournamentQuery.test.tsx` stay green under the added
   `setupFiles`.

### E2E (Playwright)

- `e2e/roadmap.spec.ts` stays green: opening the Final still exposes the panel as `role=complementary` name
  `"Match details"` with `aria-hidden="false"`; the close-button accessible name is unchanged (icon is
  decorative), so no spec assertion breaks. It asserts only the panel role/`aria-hidden` and never reads
  kickoff text, so the tz/locale pin does not change its result.
- `e2e/a11y.spec.ts` stays green: the lucide `X` is `aria-hidden` and the button retains its label, so no new
  axe violation is introduced (no focusable element inside an `aria-hidden` icon).
- `e2e/visual.spec.ts`: skips the `mobile` project (line 53); after the date refactor + `timezoneId: 'UTC'`
  pin, regenerate the four desktop breakpoint snapshots (`npm run test:e2e:update`), human-review the
  kickoff-text diff, then the suite must pass.

### Acceptance criteria as testable statements

- Grep shows **zero** `Intl.DateTimeFormat` / `toLocale*` date formatting in `src/` (the mock `iso()` builder's
  `Date.UTC().toISOString()` is instant-construction, not display formatting — non-goal).
- `package.json` lists exactly one date lib (`date-fns` + `date-fns-tz`; no `luxon`/`moment`/`dayjs`), keeps
  native `fetch` behind TanStack Query (no `axios`/`ky`), and adds `d3-hierarchy` (+ types), `lucide-react`,
  `@testing-library/user-event`, `prettier`, `prettier-plugin-tailwindcss`. **No `framer-motion`** is present.
- Grep for `bracketHierarchy|d3-bracket-adapter` in `src/` returns nothing (no wrapper shipped).
- Grep for `✕` (and other inline icon glyphs) in `src/` returns nothing; `MatchDetailPanel` imports `X` from
  `lucide-react`.
- `npm run format:check` (`prettier --check .`) passes with Tailwind class ordering applied.
- `requirements/zoomable-roadmap-graph.md` no longer names Dagre or "Next also acceptable" and names
  d3-hierarchy + Tailwind + TanStack Query + tz lib.
- `npm run test`, `npm run typecheck`, and `npm run build` (Vite) all pass.

### Coverage target

≥80% line/branch on the new logic module `src/lib/datetime.ts` (the only new production logic; `coverage.include`
is extended to it). The d3-hierarchy work ships no production module (smoke test only → no coverage target).
`MatchDetailPanel.tsx` is exercised by its component test but is not a logic module; the overall suite must stay
green and existing covered modules must not regress below their current levels.

## Risks & Open Questions

- **Visual snapshot churn (mitigated).** The date refactor changes rendered kickoff text from machine-zone to
  fixed-UTC. Mitigation: pin `timezoneId: 'UTC'` + `locale: 'en-US'` in Playwright, regenerate the four
  committed desktop baselines, human-review the diff (explicit step in the sequence). Residual risk: regenerated
  text differs from a reviewer's expectation — surfaced in the snapshot-diff review, not a runtime surprise.
- **framer-motion deferred, not added (decided).** No non-graph animation needs a JS animation library today;
  the panel already uses a compositor-only CSS transition and React Flow owns graph motion. **Trigger to
  revisit:** if a future surface needs orchestrated enter/exit or shared-element motion that CSS can't express
  cleanly, add `framer-motion` then (sparingly, compositor-only). Adding it now would be unused bundle bloat
  against the SPA budget.
- **Vitest environment split (low risk).** The config already includes `*.test.tsx` and uses a per-file
  `// @vitest-environment jsdom` pragma; new component tests follow the same pragma, so the global `node`
  default (which the domain/data tests and `env.ts` `WC_PROVIDER=mock` pin depend on) is unaffected. Adding
  `setupFiles` must not change the global environment — verify the node domain suite still passes.
- **`@testing-library/jest-dom` import path.** With Vitest, register via `@testing-library/jest-dom/vitest` (in
  `vitest.setup.ts`), not the Jest entry, to avoid a missing-`expect` extension error. The existing hook test
  works without a setup file; adding one must not break it.
- **prettier-plugin-tailwindcss + Tailwind v4.** The plugin must resolve the v4 `@theme`/`@import 'tailwindcss'`
  config (no `tailwind.config.js` exists). v4 is auto-detected by recent plugin versions; if class sorting is a
  no-op, that is acceptable (ordering is still consistent). Pin a plugin version known to support Tailwind v4.
- **Error UX out of scope (decided).** `RoadmapCanvas.tsx:62` reads only `{ data, loading }`; the hook still
  returns `error` for a future task. No visible error surface is wired here.
- **d3 dep without a consumer in this req (intentional).** Adding `d3-hierarchy` here while req #2 owns its use
  means it sits unused until req #2 lands — intentional ordering (req #3 precedes req #2). The smoke test guards
  against the dep being unresolvable/mis-typed so req #2 starts on a known-good base; no wrapper is shipped, so
  there is no risk of divergence from req #2's design.
- **Open question (non-blocking):** should `formatDateTime` ever render the viewer's local zone instead of UTC?
  Deferred — the `tz` argument makes this a one-line future change; UTC default chosen for determinism now.

## Implementation sequence (ordered, suite green at each step)

1. **Deps & tooling.** Update `package.json` (add date-fns/date-fns-tz/lucide-react deps; d3-hierarchy +
   @types/d3-hierarchy, @testing-library/user-event, prettier, prettier-plugin-tailwindcss devDeps; `format`
   /`format:check` scripts). `npm install` (local). Add `.prettierrc` + `.prettierignore`.
2. **Test harness.** Add `vitest.setup.ts`; add `setupFiles` + extend `coverage.include` in `vitest.config.ts`.
   Run `npm run test` — existing suite stays green.
3. **d3-hierarchy proof.** Add `src/lib/d3-hierarchy.smoke.test.ts`; run it green (proves the dep installs/types).
4. **Date façade.** Create `src/lib/datetime.ts`; convert `src/features/roadmap/format.ts` to a barrel; add
   `src/lib/datetime.test.ts`. `npm run test` + `npm run typecheck` green.
5. **Icon swap.** Replace the `✕` in `MatchDetailPanel.tsx` with lucide `<X aria-hidden />`; add
   `MatchDetailPanel.test.tsx`. `npm run test` green.
6. **Pin Playwright tz/locale.** Add `timezoneId: 'UTC'` + `locale: 'en-US'` to the shared `use` block.
7. **Re-baseline visual snapshots.** Run `npm run test:e2e:update`; **human-review the kickoff-text diff (UTC
   wall-clock differs from the prior machine-zone baseline — do not blind-accept)**; confirm `e2e/visual.spec.ts`
   then passes alongside `e2e/roadmap.spec.ts` / `e2e/a11y.spec.ts`.
8. **Format pass.** Run `npm run format`; review the (Tailwind-class-order) diff; confirm `npm run format:check`
   passes.
9. **Docs.** Update `requirements/zoomable-roadmap-graph.md`; reconcile any residual gap in
   `requirements/library-first-stack-policy.md` (framer-motion row → "deferred"). Record the Tailwind-v4-only
   audit note.
10. **Final gate.** `npm run format:check`, `npm run typecheck`, `npm run test` (with coverage), `npm run build`
    (Vite), and `npm run test:e2e` all green.

## Acceptance Criteria

1. `date-fns` + `date-fns-tz` are added; a single `src/lib/datetime.ts` façade renders **all** `kickoff` values
   via `formatInTimeZone` against an explicit default zone (`'UTC'`); `format.ts` re-exports it; **no**
   `Intl.DateTimeFormat`/`toLocale*` date formatting remains anywhere in `src/` (except the non-goal mock
   `iso()` instant builder).
2. The kickoff-format change is acknowledged as intentional: unit-test golden strings assert the explicit-zone
   path, and the four committed Playwright desktop snapshots are regenerated under `timezoneId: 'UTC'` +
   `locale: 'en-US'` with a human-reviewed diff; the visual suite passes.
3. `d3-hierarchy` + `@types/d3-hierarchy` are added **as a dependency only**; `src/lib/d3-hierarchy.smoke.test.ts`
   proves install/type-resolution; **no** `d3-bracket-adapter`/`bracketHierarchy` wrapper exists; req #2 owns
   hierarchy construction; no Dagre/dagre-d3 dep exists.
4. `lucide-react` is added and the `✕` close glyph in `MatchDetailPanel` (the only literal icon glyph in `src/`)
   is replaced with an accessible lucide `<X aria-hidden />`; the button's accessible name
   `"Close match details"` is preserved; grep finds no remaining inline icon glyphs/SVGs in `src/`.
5. `@testing-library/user-event` is added and used by the new component test; component tests run on jsdom via
   the existing per-file `// @vitest-environment jsdom` pragma; `@testing-library/react`/`jest-dom`/`jsdom`
   (already installed by the migration) are wired via a `vitest.setup.ts` `setupFiles` entry without changing
   the global `node` environment; the existing node domain suite stays green.
6. **framer-motion is NOT added** (deferred — no consumer); the `MatchDetailPanel` slide keeps its existing
   compositor-only CSS transition and `inert`/`aria-hidden`/`aria-label` + focus contract so
   `e2e/roadmap.spec.ts` and `e2e/a11y.spec.ts` stay green; the deferral is recorded with its revisit trigger.
7. `prettier` + `prettier-plugin-tailwindcss` are added with `.prettierrc`, `.prettierignore`, and
   `format`/`format:check` scripts; `npm run format:check` passes with Tailwind class ordering applied.
8. `package.json` reflects the stack map with **no two libraries for one concern** (one date lib; native
   `fetch` behind TanStack Query only — no axios/ky); the migration-completed rows (Vite+Hono, TanStack Query,
   Tailwind v4, Testing Library/jsdom) are not duplicated or undone.
9. Styling is verified Tailwind-v4-only (`src/styles/global.css` `@theme` tokens; rest is React Flow vendor
   CSS); audit note recorded.
10. `src/lib/datetime.ts` meets ≥80% coverage; the d3-hierarchy work ships no production module (smoke test
    only); the full Vitest suite passes; `npm run typecheck` and `npm run build` (Vite) pass.
11. `requirements/zoomable-roadmap-graph.md` is updated (Dagre → d3-hierarchy; Tailwind; TanStack Query; tz
    lib; Vite+React+Hono framework note), and `requirements/library-first-stack-policy.md`'s stack map matches
    post-migration reality (framer-motion row marked "deferred — no consumer"; no row implies Next.js).
12. Domain logic (standings, bracket topology, `R32_SEEDING`, stage-order, mock simulator incl. `mulberry32`,
    `drawGoals`, `decide`, and the `iso()` instant builder) is unchanged — no library replaces it.

```

```
