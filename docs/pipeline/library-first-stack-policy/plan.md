# Plan: Library-first stack policy — concrete library adoptions & refactors

This is requirement #3: a standing policy **plus** concrete library additions/refactors driven by the
canonical stack map in `requirements/library-first-stack-policy.md`. It must land **after** the in-flight
zoomable-graph LOD work and **before** the per-match-orientation overhaul (req #2), which consumes the
`d3-hierarchy` dependency added here.

> **Revision #3 note.** This revision resolves every item in
> `docs/pipeline/library-first-stack-policy/plan-review.md` (H1-new, M1-new, M2-new, L1-new, L2-new). The
> central change: the previously-planned `d3-bracket-adapter.ts` module is **dropped** (review's *preferred*
> fix for H1-new). Req #2's own plan (`docs/pipeline/per-match-nodes-and-orientation/plan.md:138-187`)
> builds its d3 hierarchy **inline** in `bracket-layout.ts` over the full `BracketNode` with a `kind`-switching
> child accessor and **never imports** `bracketHierarchy`/the adapter — so shipping the adapter would mean a
> tested ~140-line module with no consumer, duplicating req #2's child-resolution logic, with a datum
> (`{matchId, stage, slotIndex}`) too lossy for req #2's `[home, away]` slot-ordering guarantee. This req now
> only **adds the `d3-hierarchy` + `@types/d3-hierarchy` deps** and proves the install with a minimal smoke
> test; req #2 owns hierarchy construction. Dropping the adapter also dissolves M1-new (no lossy datum
> remains). A review-item reconciliation table is at the end.

## Scope

### In scope (concrete, implementable)
1. **Server state / data fetching → TanStack Query.** Add `@tanstack/react-query`. Refactor the hand-rolled
   `setInterval` + `AbortController` polling in `src/features/roadmap/hooks/useTournament.ts` to a `useQuery`
   with `refetchInterval` polling. Add a single `QueryClientProvider` boundary. Keep the route handler
   (`/api/worldcup`) + Zod (`parseTournament`) as the validated initial-fetch path; do not duplicate server
   state into a client store.
2. **Date/time + timezone → date-fns + date-fns-tz.** Add both. Replace the three hand-rolled
   `Intl.DateTimeFormat(undefined, …)` calls in `src/features/roadmap/format.ts` (grep-confirmed the **only**
   such usages in `src/`) so every `kickoff` (ISO-UTC `Match.kickoff`) renders through one consistent date
   path. The three consumers — `src/components/nodes/MatchNode.tsx`, `src/components/nodes/StatusPill.tsx`,
   `src/components/panel/MatchDetailPanel.tsx` — all import from `format.ts`, so the refactor is isolated.
3. **Tree / bracket layout lib → d3-hierarchy (dependency only).** Add `d3-hierarchy` + `@types/d3-hierarchy`
   so req #2 can build the bracket-tree layout on it. **No production wrapper module is added here**
   (H1-new): req #2 constructs its hierarchy inline. Prove the dep is installed and usable with a **minimal
   smoke test** (`src/lib/d3-hierarchy.smoke.test.ts`) asserting `hierarchy(...).leaves()` works. (No Dagre
   exists in `package.json` to remove — "supersedes Dagre" is satisfied by never adding it; the only doc
   reference is fixed in the follow-up.)
4. **Icons → lucide-react.** Add `lucide-react`. Replace the literal-glyph `✕` close button in
   `src/components/panel/MatchDetailPanel.tsx` with an accessible lucide `<X aria-hidden />` icon (the
   button's `aria-label="Close match details"` stays the accessible name).
5. **UI animation (non-graph) → framer-motion (package name `framer-motion`), sparingly.** Apply to exactly
   one surface (the `MatchDetailPanel` slide-in/out) using compositor-only properties (transform/opacity),
   keeping the panel **always mounted** (no `AnimatePresence` unmount) and preserving the verified
   `inert`/`aria-hidden`/`aria-label`/focus contract. Subject to the bundle-budget gate (Risks) — if the
   analyzer shows the dep does not fit the <150 kb landing budget with margin, keep the existing CSS
   transition and record framer-motion as available-but-unused.
6. **Testing → Testing Library.** Add `@testing-library/react`, `@testing-library/jest-dom`,
   `@testing-library/user-event`, and `jsdom`. Wire a Vitest setup file + jsdom environment for component
   tests while keeping the existing pure-node domain tests green. Widen the `include` glob to
   `*.test.{ts,tsx}`.
7. **Lint/format → Prettier + prettier-plugin-tailwindcss.** Add `prettier`, `prettier-plugin-tailwindcss`.
   Add config + `format` / `format:check` scripts. Do not reformat the whole tree beyond what the plugin needs
   to prove class ordering (keep the diff reviewable).
8. **Single-styling-system verification.** Confirm Tailwind v4 (`@import 'tailwindcss'` + `@theme` tokens in
   `src/app/globals.css:1,8`) is the only styling system; record an audit note that there is no parallel
   bespoke CSS framework (already true). No code change beyond the audit note unless a violation is found.
9. **package.json hygiene.** Reflect the stack map with no two libraries solving one concern (one date lib,
   one data-fetching lib, native fetch only, etc.).
10. **E2E determinism for the date refactor.** Pin `use.timezoneId: 'UTC'` and `use.locale: 'en-US'` in
    `playwright.config.ts` so kickoff text is reproducible, then regenerate + human-review the visual
    snapshots (explicit ordered step in the implementation sequence; L2-new).
11. **Follow-up doc update.** Update `requirements/zoomable-roadmap-graph.md`: Dagre → d3-hierarchy, add
    Tailwind, TanStack Query, and the tz lib for kickoff display; reconcile the stale Vite/SPA references to
    the Next 15 reality.

### Out of scope (explicitly)
- **`d3-bracket-adapter.ts` is NOT built (H1-new).** Req #2 owns hierarchy construction (its `bracket-layout.ts`
  rewrite builds `d3.hierarchy` inline over full `BracketNode` with `[home, away]` ordering —
  `docs/pipeline/per-match-nodes-and-orientation/plan.md:162-187`). This req only adds the dependency and a
  smoke test; it does not pre-commit any hierarchy API the consumer rejects.
- **Domain logic stays hand-written (non-goals).** `computeGroups` (standings), `buildBracket`
  (`src/domain/bracket/build-bracket.ts`, topology), `R32_SEEDING`, `stage-order`, the deterministic mock
  simulator (`mulberry32` PRNG, Poisson `drawGoals`, `decide`), and the mock's `iso()` UTC fixture-builder
  (`Date.UTC(...).toISOString()` — it constructs an instant, it does **not** format display text, so it is
  correctly excluded from the date refactor). Do not library-ize.
- **`computeBracketLayout` is NOT replaced here.** d3-hierarchy is added as a dependency only; porting the
  bracket layout onto it is req #2's job.
- **shadcn/ui, Zustand, nuqs** — optional/only-if-needed. Noted in Risks; **not added** (no forcing).
  `useStageView` already does URL state by hand correctly; leave it (nuqs is a justified-but-optional
  follow-up).
- **User-facing error UI** — the app renders no error surface today (`RoadmapCanvas.tsx:64` destructures only
  `{ data, loading }`). Wiring `error` into a visible state is **out of scope**; the refactored hook keeps
  returning `error` for a future task. Documented, not silently dropped.
- **Liveness-aware refetch cadence** — not added; client poll stays a fixed `pollMs` default.
- **Playwright is already configured**; not re-added. No new E2E *specs* required, but the visual snapshots
  are regenerated.
- No migration to a Vite SPA — Next 15 (Turbopack) builds the app; Vite powers Vitest only.
- No new domain fields (e.g. venue timezone) — `Venue` has only `name`/`city`; tz rendering uses an explicit
  default zone, not a per-venue zone we don't have.

## Approach

Adopt the canonical libraries **incrementally and surgically**, one concern at a time, preserving the
existing clean boundaries (route handler + Zod for the server fetch; `format.ts` as the single date façade;
`useTournament` as the single client-fetch hook). Because the codebase already funnels each concern through
one module, every refactor is local: the date change touches only `format.ts` + a new `@/lib/datetime`; the
fetch change touches `useTournament.ts` + a provider; icons/motion touch only the panel. This keeps each diff
reviewable and existing tests green.

For **TanStack Query**, wrap the app in a single `QueryClientProvider` (a `'use client'` component mounted in
`src/app/layout.tsx`) and rewrite `useTournament` to call
`useQuery({ queryKey: ['tournament'], queryFn, refetchInterval: pollMs })`, unwrapping the existing
`ApiEnvelope<Tournament>` and returning `{ data, error, loading }`. The single call site
(`src/components/roadmap/RoadmapCanvas.tsx:64`, which destructures only `{ data, loading }`) is therefore
unchanged. The route's liveness-tiered TTL cache stays the source of truth; Query owns client polling +
caching only — no duplicated server state.

For **dates**, replace `Intl.DateTimeFormat` with `date-fns-tz` `formatInTimeZone` over `parseISO(iso)`,
rendering in an **explicit IANA zone** (default `'UTC'`, see Data Model). All call sites already pass through
`format.ts`, which re-exports the new `@/lib/datetime` façade.

For **d3-hierarchy**, add the dep + a smoke test only. No wrapper. The smoke test imports `hierarchy` from
`d3-hierarchy` and asserts a trivial `hierarchy(node, accessor).leaves().length` to prove the package and its
types resolve in the build — leaving the real bracket→tree construction to req #2 where it is already
designed.

**Rejected alternative (dates):** Luxon instead of date-fns. Both are canonical; the stack map names date-fns
as the pick (Luxon only as the acceptable alternative — "pick one, don't ship both"). date-fns is
tree-shakeable (smaller landing-page bundle, which matters for the <150 kb JS budget) and pairs cleanly with
`date-fns-tz`, so we follow the map's primary pick.

**Rejected alternative (d3 deliverable):** shipping a `d3-bracket-adapter.ts` wrapper as a "ready entry point
for req #2." Rejected per H1-new: req #2's plan builds the hierarchy inline and never imports it, so the
wrapper would be unused, duplicative, and carry a lossy datum. The requirement only mandates *adding the
dependency* ("consumed by req #2"), which the dep + smoke test satisfies.

## Files

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | modify | Add deps: `@tanstack/react-query`, `date-fns`, `date-fns-tz`, `d3-hierarchy`, `lucide-react`, `framer-motion` (literal name, not `motion`). Add devDeps: `@types/d3-hierarchy`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `prettier`, `prettier-plugin-tailwindcss`. Add scripts `format`, `format:check`. Verify no duplicate-concern deps. |
| `src/app/providers.tsx` | create | `'use client'` `QueryClientProvider`. Exports `<AppProviders>` wrapping children with a `useState`-stabilized singleton `QueryClient` (defaults: `staleTime`, `refetchOnWindowFocus: false`, `retry: 1`). <50 lines. Covered transitively via the `useTournament` test wrapper; no per-file 80% target on this trivial wrapper. |
| `src/app/layout.tsx` | modify | Wrap `{children}` in `<AppProviders>` inside `<body>`. Keep fonts/metadata/viewport/`html lang` unchanged. |
| `src/features/roadmap/hooks/useTournament.ts` | modify | Rewrite over `useQuery`. `queryFn` does `fetch('/api/worldcup', { cache: 'no-store' })`, unwraps `ApiEnvelope<Tournament>`, **throws** on `success:false` (Query owns error/retry). `refetchInterval: pollMs` (fixed default `45_000`). Return `{ data: data ?? null, error: error ? error.message : null, loading: isPending }` — same `TournamentState` shape, no `setInterval`/`AbortController`/`useRef`. |
| `src/lib/datetime.ts` | create | New single date/timezone façade. Exports `formatDateTime`, `formatTime`, `formatDate`, and `resolveTimeZone()`. Wraps `date-fns-tz` `formatInTimeZone` + `date-fns` `parseISO`. Null ISO → existing fallbacks (`'Date TBD'`, `'--:--'`, `'TBD'`). Pure, no React. Format tokens chosen to mirror current visible shape. <120 lines. |
| `src/features/roadmap/format.ts` | modify | Becomes a thin barrel: `export { formatDateTime, formatTime, formatDate } from '@/lib/datetime';`. All current importers — `src/components/nodes/MatchNode.tsx`, `src/components/nodes/StatusPill.tsx`, `src/components/panel/MatchDetailPanel.tsx` — keep working with zero call-site churn. |
| `src/components/panel/MatchDetailPanel.tsx` | modify | Replace the `✕` glyph (line 97) with lucide `<X aria-hidden />` inside the existing `aria-label="Close match details"` button (lines 91-98). **If framer-motion passes the budget gate:** convert the slide (lines 78-85) to a persistent `motion.aside` animating `x`/opacity via `animate` (no `AnimatePresence`, stays mounted), guarded by `useReducedMotion()` from `framer-motion`; keep `inert`/`aria-hidden`/`aria-label="Match details"` and the focus contract (lines 71-86). **Else:** keep the current CSS `transition-transform` unchanged and only swap the icon. |
| `vitest.config.ts` | modify | Widen `include` to `['src/**/*.test.{ts,tsx}']`. Add `environmentMatchGlobs: [['**/*.test.tsx', 'jsdom'], ['**/*.test.ts', 'node']]` so domain `.test.ts` stays `node`. Add `setupFiles: ['./vitest.setup.ts']`. Extend coverage `include` with `src/lib/**`, `src/features/roadmap/hooks/useTournament.ts` (not `providers.tsx`). |
| `vitest.setup.ts` | create | Import `@testing-library/jest-dom/vitest`; register `afterEach(cleanup)` from `@testing-library/react`. <20 lines. |
| `playwright.config.ts` | modify | Add `timezoneId: 'UTC'` and `locale: 'en-US'` to the shared `use` block so kickoff text is deterministic across machines/CI (L1-new: shared `use.timezoneId` overrides the `mobile` project's `devices['iPhone 13']` descriptor; pin `locale` here too so it wins on every project). |
| `prettier.config.mjs` | create | `{ singleQuote: true, semi: true, printWidth: 100, plugins: ['prettier-plugin-tailwindcss'] }` to match existing code style. |
| `.prettierignore` | create | Ignore `node_modules`, `.next`, `coverage`, `*.snap`, `e2e/**/*-snapshots`. |
| `src/lib/datetime.test.ts` | create | Unit tests for the date façade — explicit-zone golden strings, null fallbacks, two-zone divergence. (node) |
| `src/lib/d3-hierarchy.smoke.test.ts` | create | **Smoke test (replaces the dropped adapter test, H1-new).** Imports `hierarchy` from `d3-hierarchy`; asserts `hierarchy({...}, accessor).leaves().length` on a tiny inline tree to prove the dep + `@types/d3-hierarchy` install and resolve. <30 lines. (node) |
| `src/features/roadmap/hooks/useTournament.test.tsx` | create | Hook test for the Query refactor (success, failure-with-prior-data, poll cadence) with mocked `fetch` + `QueryClientProvider` wrapper. (jsdom) |
| `src/components/panel/MatchDetailPanel.test.tsx` | create | Component test: close button accessible name + `onClose`, kickoff text from façade, reduced-motion path. (jsdom) |
| `e2e/visual.spec.ts-snapshots/*.png` | regenerate | Re-baseline the four breakpoint screenshots via `npm run test:e2e:update` after the date refactor + tz pin; human-review the kickoff-text diff (L2-new ordered step). |
| `requirements/zoomable-roadmap-graph.md` | modify | Dagre → d3-hierarchy; add Tailwind, TanStack Query, tz lib; reconcile stale "React + Vite" / `vite.config.ts` / `main.tsx` SPA references to the Next 15 reality. |

## Data Model / Types

No domain model changes. Boundary types stay as-is (`Tournament`, `Match`, `ApiEnvelope<T>`, Zod
`tournamentSchema`). New library-facing types only. **No `BracketHierDatum`/`BracketHierarchy` types are
introduced** (the adapter is dropped; M1-new's lossy-datum concern is therefore moot).

### Date façade (output format decision)

The current `Intl.DateTimeFormat(undefined, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })`
produces, e.g., `02 Jun, 14:30` — but it is **machine-zone and machine-locale dependent today** (exactly the
non-determinism this refactor removes). The refactor **intentionally changes** the contract to a
**deterministic explicit-zone, fixed-locale** render. The chosen `date-fns` tokens reproduce the same *visible
shape* (`dd MMM, HH:mm`), but the wall-clock value now resolves against an explicit zone rather than the
machine zone — so the bytes are **not guaranteed identical** to whatever produced the committed snapshots.
This is why the visual baseline must be regenerated.

```ts
// src/lib/datetime.ts
const DEFAULT_TZ = 'UTC';           // production default zone (see decision below)
const DATETIME = 'dd MMM, HH:mm';   // e.g. "02 Jun, 14:30"  (mirrors prior Intl shape)
const TIME = 'HH:mm';               // e.g. "14:30"
const DATE = 'dd MMM';              // e.g. "02 Jun"

export function resolveTimeZone(explicit?: string): string; // explicit ?? DEFAULT_TZ
export function formatDateTime(iso: string | null, tz?: string): string; // 'Date TBD' on null
export function formatTime(iso: string | null, tz?: string): string;     // '--:--'   on null
export function formatDate(iso: string | null, tz?: string): string;     // 'TBD'     on null
// Impl: formatInTimeZone(parseISO(iso), resolveTimeZone(tz), <fmt>)  // en-US tokens are locale-stable
```

**Production default zone decision:** default to a **fixed broadcast zone `'UTC'`**, not the user's resolved
zone. Rationale: (a) the app has no per-venue timezone field, so "venue-local" is impossible; (b) a fixed zone
makes both production output and the E2E visual snapshots fully deterministic without depending on the
viewer's machine; (c) it is trivially overridable per call via the `tz` argument when a future task adds
user-zone or venue-zone support. The Playwright `use.timezoneId: 'UTC'` matches this default, so the
regenerated snapshots are reproducible on any machine. Unit-test golden strings are asserted against the
explicit-zone path (`formatDateTime(iso, 'UTC')` and a second zone), never the ambient machine zone.

### d3-hierarchy (dependency, no app types)

`d3-hierarchy` is added as a dependency consumed by req #2. This req exposes **no** bracket-hierarchy types or
functions. The only new test artifact is `src/lib/d3-hierarchy.smoke.test.ts`, which uses `d3-hierarchy`'s own
`hierarchy()` / `HierarchyNode<T>` types on a throwaway inline datum to prove the install:

```ts
// src/lib/d3-hierarchy.smoke.test.ts (shape)
import { hierarchy } from 'd3-hierarchy';
// tiny inline tree { id, children } → hierarchy(root, n => n.children)
// assert root.leaves().length and root.height to prove the package + types resolve.
```

For reference, req #2 (`per-match-nodes-and-orientation/plan.md:138-187`) constructs its hierarchy as:
`hierarchy(finalBracketNode, childAccessor)` where the accessor maps `[node.home, node.away]` to the
`BracketNode` referenced by `source.matchId` only when `source.kind === 'winnerOf'`, stops at `group` leaves,
and resolves ids via a `Map` over `bracket.rounds.flatMap(r => r.nodes)`. That construction lives entirely in
req #2; this plan does not duplicate it.

### Fetch hook (unchanged public shape)

```ts
// src/features/roadmap/hooks/useTournament.ts
interface TournamentState { data: Tournament | null; error: string | null; loading: boolean; }
export function useTournament(pollMs?: number): TournamentState; // default pollMs = 45_000
```

**Poll cadence vs server TTLs:** the client poll cadence stays a **fixed `pollMs` default (`45_000`)**, exactly
preserving today's behavior. Liveness-aware TTLs (`WC_CACHE_TTL_LIVE_MS` 30s / `WC_CACHE_TTL_IDLE_MS` 10m)
remain **server-side only** — gated behind `import 'server-only'` in `env.ts`, intentionally not read in the
client `useQuery`. The server route's TTL cache already absorbs polling and tiers freshness by liveness; the
client simply asks at a steady interval. A dynamic, liveness-keyed `refetchInterval` is explicitly **not** in
scope.

### Providers

```ts
// src/app/providers.tsx
export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element;
```

No new Zod schema is required: the existing `/api/worldcup` boundary remains the validated one. Inside
`queryFn`, the `ApiEnvelope<Tournament>` discriminated union is narrowed on `success` and a typed
`Error(message)` is thrown on failure.

## Test Strategy

Framework: **Vitest + Testing Library** (component) and the existing **Vitest (node)** domain suite. E2E stays
on Playwright; the existing specs (`e2e/roadmap.spec.ts`, `e2e/visual.spec.ts`) must remain green, with the
visual baseline regenerated. `vitest.config.ts` `include` is widened to `*.test.{ts,tsx}` and split by
`environmentMatchGlobs` so `.test.ts` runs in `node` and `.test.tsx` in `jsdom`.

### Behaviors to test (unit / component)
1. **datetime façade (`src/lib/datetime.test.ts`, node):**
   - `formatDateTime('2026-06-02T14:30:00.000Z', 'UTC')` → exact golden `'02 Jun, 14:30'`;
     `formatTime(..,'UTC')` → `'14:30'`; `formatDate(..,'UTC')` → `'02 Jun'` (golden strings tied to the
     explicit-zone path).
   - The **same** UTC instant formatted in `'UTC'` vs `'America/New_York'` yields **different** wall-clock
     times (proves `date-fns-tz` is wired, not `Intl`-default).
   - Null input → `'Date TBD'` / `'--:--'` / `'TBD'`.
2. **d3-hierarchy smoke (`src/lib/d3-hierarchy.smoke.test.ts`, node) — H1-new:**
   - `hierarchy(<tiny inline tree>, accessor).leaves().length` and `.height` return expected values, proving
     `d3-hierarchy` + `@types/d3-hierarchy` are installed and type-resolve. This is an install proof, **not** a
     bracket-reconstruction test (that lives in req #2).
3. **useTournament (`useTournament.test.tsx`, jsdom):**
   - On `success:true` envelope (mocked `fetch`), eventually exposes `data` truthy and `loading === false`.
   - On `success:false` envelope, exposes a non-null `error` message; asserts the **Query-accurate** behavior
     (error becomes truthy even if a prior `data` is retained) rather than the old suppression logic. Test
     wrapped in a `QueryClientProvider` with `retry: false`.
   - `refetchInterval` wiring: with fake timers and a small `pollMs`, a second `fetch` fires after the
     interval (poll cadence preserved). Asserts native `fetch` is the only HTTP path (no axios/ky).
4. **MatchDetailPanel (`MatchDetailPanel.test.tsx`, jsdom):**
   - Close button has accessible name `"Close match details"` and invokes `onClose` on click (lucide `X` is
     `aria-hidden`, so the name comes from the button's `aria-label`).
   - Kickoff row renders text from the date façade for a given match.
   - Panel is queryable by role `complementary` / name `"Match details"` and toggles `aria-hidden` with `open`
     (guards the M2 contract at component level).
   - Under mocked `prefers-reduced-motion: reduce`, no transform-based entrance animation is applied (assert
     the reduced-motion branch; if framer-motion is dropped per the budget gate, assert the CSS-transition
     class path instead).
5. **Regression guard (existing node suite):** `standings.test.ts`, `build-bracket.test.ts`,
   `build-graph.test.ts`, `lod.test.ts`, `bracket-layout.test.ts`, mapper/mock tests **pass unchanged** under
   the split jsdom/node config.

### E2E (Playwright)
- `e2e/roadmap.spec.ts` stays green unchanged: opening the Final still exposes the panel as
  `role=complementary` name `"Match details"` with `aria-hidden="false"` (M2 always-mounted constraint). Note
  (L1-new): this spec runs on the `mobile` project and opens the panel, but it asserts only the panel's
  role/`aria-hidden` — it never reads the Kick-off text — so the `mobile` device descriptor's locale does not
  affect it; the shared `use.timezoneId`/`use.locale` pin is still set so any future text assertion stays
  deterministic.
- `e2e/visual.spec.ts`: skips the `mobile` project (`e2e/visual.spec.ts:53`); regenerate the four desktop
  breakpoint snapshots (`npm run test:e2e:update`) after the date refactor + `timezoneId: 'UTC'` pin;
  human-review the kickoff-text diff; the suite must then pass.

### Acceptance criteria as testable statements
- Grep shows **zero** `Intl.DateTimeFormat` / `toLocale*` date formatting in `src/` (the mock `iso()` builder
  uses `Date.UTC().toISOString()`, which is instant-construction, not display formatting — non-goal).
- `useTournament` contains no `setInterval`/manual `AbortController` polling loop; client fetching is via
  `@tanstack/react-query`.
- `package.json` lists exactly one date lib (`date-fns`/`date-fns-tz`; no `luxon`/`moment`/`dayjs`), one
  data-fetching lib (`@tanstack/react-query`, native fetch only — no `axios`/`ky`), `d3-hierarchy` (+ types),
  `lucide-react`, `framer-motion` (the package literally named `framer-motion`), and the four
  testing-library/jsdom devDeps + prettier (+ tailwind plugin).
- **No `d3-bracket-adapter.ts` (or any `bracketHierarchy`/`{ root, thirdPlace }` wrapper) exists in `src/`**
  (H1-new); grep for `bracketHierarchy|d3-bracket-adapter` in `src/` returns nothing.
- `prettier --check` passes on touched files with Tailwind class ordering applied.
- `requirements/zoomable-roadmap-graph.md` no longer references Dagre or Vite-SPA and names d3-hierarchy +
  Tailwind + TanStack Query + tz lib.

### Coverage target
≥80% line/branch on the **new/refactored** logic modules: `src/lib/datetime.ts` and
`src/features/roadmap/hooks/useTournament.ts`. The d3-hierarchy work contributes **no production module** here,
so there is no adapter coverage target (the smoke test only proves the install). `src/app/providers.tsx` is
covered **transitively** via the `useTournament` test wrapper and is intentionally **not** held to a per-file
80% target (no branchable logic). Keep the overall suite green; `coverage.include` is extended to the two
logic modules above (`src/lib/**`, `useTournament.ts`).

## Risks & Open Questions

- **Visual snapshot churn (mitigated).** The date refactor changes rendered kickoff text. Mitigation: pin
  `timezoneId: 'UTC'` + `locale: 'en-US'` in Playwright, regenerate the four desktop baselines, human-review
  the diff (L2-new ordered step). The fixed-UTC production default makes the baseline reproducible. Residual
  risk: the regenerated text differs from what a reviewer expects — surfaced in the snapshot-diff review step,
  not a runtime surprise.
- **Bundle budget for framer-motion (decided via analyzer gate).** Decision is gated, not deferred:
  1. Establish a baseline gzipped landing JS with `npm run analyze` (`@next/bundle-analyzer` is already a
     devDep; the `analyze` script exists).
  2. framer-motion's tree-shaken slide surface (`motion` + `useReducedMotion`) adds roughly ~30–40 kb gzipped.
  3. **Rule:** add framer-motion to the panel **only if** baseline + delta stays under the <150 kb landing
     budget with comfortable margin. **Otherwise**, keep the existing compositor-only CSS transition (which
     already satisfies the requirement), still install `framer-motion` per the stack map but mark it
     available-but-unused, and ship only the lucide icon swap on the panel.
- **Vitest dual environment.** Domain tests assume `node`; component tests need `jsdom`. Mitigation:
  `environmentMatchGlobs` maps `*.test.tsx → jsdom`, `*.test.ts → node`, and `include` is widened to
  `*.test.{ts,tsx}`. Verify the node domain suite is unaffected.
- **Error UX out of scope (decided).** `RoadmapCanvas.tsx:64` reads only `{ data, loading }`; there is no
  user-facing error surface today. The refactored hook still returns `error`, but wiring it into visible UI is
  explicitly deferred. Under Query, `error` may go truthy on a failed refetch even with prior `data` retained
  — harmless because nothing renders it; the test asserts this Query-accurate behavior.
- **d3 dep without a consumer in this req (resolved by H1-new).** Adding `d3-hierarchy` here while req #2 owns
  its use means the dep sits unused until req #2 lands. This is intentional ordering (req #3 must precede
  req #2). The smoke test guards against the dep being unresolvable/mis-typed at install time so req #2 starts
  on a known-good base. No wrapper module is shipped, so there is no risk of divergence from req #2's design.
- **Optional libs (shadcn/ui, Zustand, nuqs) intentionally omitted.** If review insists on nuqs for
  `useStageView`, that is an additive follow-up; flagged, not blocking.
- **TanStack Query + Server Components.** No SSR dehydrate/hydrate prefetch is added; the page is a client
  `RoadmapCanvas` and initial data still arrives on the first client fetch. Preserves current behavior; SSR
  prefetch is an optional future enhancement.

## Implementation sequence (ordered)

This ordering keeps the suite green at each step and makes the chicken-and-egg snapshot re-baseline explicit
(L2-new):

1. **Deps & tooling.** Update `package.json`; install. Add `prettier.config.mjs` + `.prettierignore` +
   `format`/`format:check` scripts.
2. **Test harness.** Add `vitest.setup.ts`; update `vitest.config.ts` (`include` widen, `environmentMatchGlobs`,
   `setupFiles`, coverage include). Confirm existing node suite still green.
3. **d3-hierarchy proof.** Add `src/lib/d3-hierarchy.smoke.test.ts`; run it green (proves the dep installs).
4. **TanStack Query.** Create `src/app/providers.tsx`; wrap in `src/app/layout.tsx`; rewrite
   `useTournament.ts`; add `useTournament.test.tsx`. Verify `RoadmapCanvas` call site unchanged.
5. **Date façade.** Create `src/lib/datetime.ts`; convert `format.ts` to a barrel; add `datetime.test.ts`.
6. **Pin Playwright tz/locale.** Add `timezoneId: 'UTC'` + `locale: 'en-US'` to the shared `use` block.
7. **Re-baseline visual snapshots.** Run `npm run test:e2e:update`; **human-review the kickoff-text diff for
   correctness (UTC wall-clock is a different value than the prior machine-zone baseline — do not blind-accept);**
   confirm `e2e/visual.spec.ts` then passes.
8. **Panel polish.** Run `npm run analyze` baseline; apply the framer-motion budget rule; swap the `✕` glyph
   for lucide `<X>`; add `MatchDetailPanel.test.tsx`. Confirm `e2e/roadmap.spec.ts` stays green.
9. **Styling audit + follow-up doc.** Record the Tailwind-v4-only audit note; update
   `requirements/zoomable-roadmap-graph.md`.
10. **Final gate.** `prettier --check`, `typecheck`, full `vitest run --coverage`, `playwright test` all green.

## Acceptance Criteria

1. `@tanstack/react-query` is added; `useTournament` is refactored onto `useQuery` with a fixed
   `refetchInterval: pollMs` (default `45_000`); the hand-rolled `setInterval`/`AbortController` loop is gone;
   the `RoadmapCanvas` call site (`{ data, loading }`) is unchanged; a `QueryClientProvider` boundary wraps the
   app.
2. The route handler `/api/worldcup` + Zod (`parseTournament`) remain the validated initial-fetch path; no
   server state is duplicated into a client store; server-only TTLs stay server-only.
3. `date-fns` + `date-fns-tz` are added; a single `src/lib/datetime.ts` façade renders all `kickoff` values via
   `formatInTimeZone` against an explicit default zone (`'UTC'`); `format.ts` re-exports it; no
   `Intl.DateTimeFormat`/`toLocale*` date formatting remains in `src/` (except the non-goal mock `iso()`
   instant builder).
4. The kickoff-format change is acknowledged as intentional: unit-test golden strings assert the explicit-zone
   path, and the Playwright visual baseline is regenerated under `timezoneId: 'UTC'` with a human-reviewed diff;
   the visual suite passes.
5. `d3-hierarchy` + `@types/d3-hierarchy` are added **as dependencies only**; a minimal smoke test
   (`src/lib/d3-hierarchy.smoke.test.ts`) proves the install/type-resolution; **no `d3-bracket-adapter.ts`
   wrapper or `bracketHierarchy` export exists** (H1-new); req #2 owns hierarchy construction; no
   Dagre/dagre-d3 dep exists.
6. `lucide-react` is added and the `✕` close glyph in `MatchDetailPanel` is replaced with an accessible lucide
   `X` icon (button's accessible name `"Close match details"` preserved).
7. `framer-motion` (the package literally named `framer-motion`) is added; the panel animation, if applied,
   stays always-mounted (no `AnimatePresence` unmount), uses transform/opacity only, is reduced-motion-guarded,
   and preserves the `inert`/`aria-hidden`/`aria-label` + focus contract so `e2e/roadmap.spec.ts` stays green;
   if the analyzer gate fails the budget, the CSS transition is kept and framer-motion is recorded
   available-but-unused.
8. `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` are added
   and wired into Vitest via a setup file + `environmentMatchGlobs`; `include` is widened to `*.test.{ts,tsx}`
   so new component tests run; existing node domain tests stay green.
9. `prettier` + `prettier-plugin-tailwindcss` are added with config, ignore file, and `format`/`format:check`
   scripts; `prettier --check` passes on touched files with Tailwind class ordering.
10. Styling is verified Tailwind-v4-only (tokens via `@theme`); no second styling system beyond global
    resets/tokens (audit note recorded).
11. `package.json` reflects the stack map with **no two libraries for one concern** (one date lib, one
    data-fetching lib, native fetch only).
12. The bundle-budget call is resolved by an analyzer baseline + the explicit add-only-if-it-fits rule, not
    deferred to the reviewer.
13. New/refactored logic modules (`datetime.ts`, `useTournament.ts`) meet ≥80% coverage; the d3-hierarchy work
    ships no production module (smoke test only, no coverage target); `providers.tsx` is covered transitively;
    the full Vitest suite passes.
14. `requirements/zoomable-roadmap-graph.md` is updated: Dagre → d3-hierarchy; plus Tailwind, TanStack Query,
    tz lib; and the stale Vite/SPA references reconciled to Next 15.
15. Domain logic (standings, bracket topology, `R32_SEEDING`, stage-order, mock simulator incl. `mulberry32`,
    `drawGoals`, `decide`, `iso()`) is unchanged — no library replaces it.

## Review-item reconciliation (revision #3)

| Review id | Resolution |
|---|---|
| H1-new (HIGH) | **Preferred fix (a): dropped `d3-bracket-adapter.ts`.** Verified req #2's plan (`per-match-nodes-and-orientation/plan.md:138-187`) builds the hierarchy inline and never imports the adapter. This req now adds only `d3-hierarchy` + `@types/d3-hierarchy` and proves the install with `src/lib/d3-hierarchy.smoke.test.ts`. Acceptance criteria #5 and #13 re-scoped; Files/Test tables updated; a "no wrapper exists" grep assertion added. |
| M1-new (MEDIUM) | Dissolved by H1-new: no `BracketHierDatum` is introduced, so there is no lossy datum to fix. req #2 reads the full `BracketNode` (`home`/`away`) directly in its own inline accessor. |
| M2-new (MEDIUM) | Paths corrected throughout: `src/domain/bracket/build-bracket.ts` (sources verified at lines 89-97 `winnerOf`/`group`, 152-153 `loserOf`); call site `src/components/roadmap/RoadmapCanvas.tsx:64` (`{ data, loading }`); `src/components/nodes/MatchNode.tsx` + `src/components/nodes/StatusPill.tsx` + `src/components/panel/MatchDetailPanel.tsx` named as the three `format.ts` consumers in the Files table. |
| L1-new (LOW) | Confirmed: shared `use.timezoneId` overrides the `mobile` project's `devices['iPhone 13']`; `locale` is pinned in the same shared `use` block so it wins on every project. Verified `e2e/roadmap.spec.ts` (runs on mobile) asserts only the panel role/`aria-hidden` and never reads kickoff text; `e2e/visual.spec.ts:53` skips mobile. |
| L2-new (LOW) | Added an explicit ordered "Implementation sequence" with step 7 = refactor date façade → pin `timezoneId:'UTC'` → `test:e2e:update` → **human-review the kickoff-text diff (not blind-accept)** → suite green. |
