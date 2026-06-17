# Plan: Library-first stack policy — concrete library adoptions & refactors

This is requirement #3: a standing policy **plus** concrete library additions/refactors driven by the
canonical stack map in `requirements/library-first-stack-policy.md`. It must land **after** the in-flight
zoomable-graph LOD work and **before** the per-match-orientation overhaul (req #2), which consumes the
`d3-hierarchy` dependency added here.

## Scope

### In scope (concrete, implementable)
1. **Server state / data fetching → TanStack Query.** Add `@tanstack/react-query`. Refactor the hand-rolled
   polling in `useTournament.ts` to a `useQuery` with interval polling. Add a `QueryClientProvider` boundary.
   Keep the route handler (`/api/worldcup`) + Zod (`parseTournament`) as the validated initial-fetch path; do
   not duplicate server state into a client store.
2. **Date/time + timezone → date-fns + date-fns-tz.** Add both. Replace all hand-rolled `Intl.DateTimeFormat`
   kickoff/time formatting in `src/features/roadmap/format.ts` so every `kickoff` (ISO-UTC `Match.kickoff`)
   renders through one consistent date path. Consumers: `MatchNode.tsx`, `StatusPill.tsx`,
   `MatchDetailPanel.tsx` (all already import from `format.ts`, so the refactor is isolated to `format.ts`).
3. **Tree / bracket layout lib → d3-hierarchy.** Add `d3-hierarchy` + `@types/d3-hierarchy` as a dependency so
   req #2 can build the bracket-tree layout on it. Add a thin, tested adapter module proving the dep is wired
   and usable. (No Dagre exists in `package.json` to remove — "supersedes Dagre" is satisfied by never adding
   it; the only doc reference is fixed in the follow-up below.)
4. **Icons → lucide-react.** Add `lucide-react`. Replace the literal-glyph icons currently used as UI controls
   (the `✕` close button in `MatchDetailPanel.tsx`) with accessible lucide icons.
5. **UI animation (non-graph) → framer-motion, sparingly.** Add `framer-motion`. Apply to exactly one surface
   (the `MatchDetailPanel` slide-in/out) using compositor-only properties (transform/opacity) behind a
   reduced-motion guard. React Flow keeps owning graph motion. No other component animates via framer-motion in
   this requirement.
6. **Testing → Testing Library.** Add `@testing-library/react`, `@testing-library/jest-dom`,
   `@testing-library/user-event`, and `jsdom`. Wire a Vitest setup file + jsdom environment for component tests
   while keeping the existing pure-node domain tests green.
7. **Lint/format → Prettier + prettier-plugin-tailwindcss.** Add `prettier`, `prettier-plugin-tailwindcss`. Add
   config + a `format` / `format:check` script. Do not reformat the whole tree in this PR beyond what the plugin
   needs to prove class ordering (keep the diff reviewable).
8. **Single-styling-system verification.** Confirm Tailwind v4 (`@theme` tokens in `globals.css`) is the only
   styling system; document that there is no parallel bespoke CSS framework (already true). No code change beyond
   the audit note unless a violation is found.
9. **package.json hygiene.** Reflect the stack map with no two libraries solving one concern (one date lib, one
   data-fetching lib, native fetch only, etc.).
10. **Follow-up doc update.** Update `requirements/zoomable-roadmap-graph.md`: Dagre → d3-hierarchy, add
    Tailwind, TanStack Query, and the tz lib for kickoff display.

### Out of scope (explicitly)
- **Domain logic stays hand-written (non-goals).** `computeGroups` (standings), `buildBracket` (topology),
  `R32_SEEDING`, `stage-order`, the deterministic mock simulator (`mulberry32` PRNG, Poisson `drawGoals`,
  `decide`), and the mock's `iso()` UTC fixture-builder. These are WC rules / tiny deterministic helpers — do
  not library-ize.
- **`computeBracketLayout` is NOT replaced here.** d3-hierarchy is *added as a dependency + adapter*; actually
  porting the bracket layout onto it is req #2's job (this plan only guarantees the dep + a proven entry point).
- **shadcn/ui, Zustand, nuqs** — optional/only-if-needed. Noted in Risks; **not added** (no forcing). `useStageView`
  already does URL state by hand correctly; leave it (nuqs would be a justified-but-optional follow-up).
- **Playwright** is already configured (`playwright.config.ts`, `e2e/`); not re-added. No new E2E specs required
  beyond keeping existing ones green.
- No migration to a Vite SPA — Next 15 (Turbopack) builds the app; Vite powers Vitest only.
- No new domain fields (e.g. venue timezone) — `Venue` has only `name`/`city`; tz rendering uses the user's
  resolved timezone (and an explicit UTC display path), not a per-venue zone we don't have.

## Approach

Adopt the canonical libraries **incrementally and surgically**, one concern at a time, preserving the existing
clean boundaries (route handler + Zod for the server fetch; `format.ts` as the single date façade; `useTournament`
as the single client-fetch hook). Because the codebase already funnels each concern through one module, every
refactor is local: the date change touches only `format.ts`; the fetch change touches only `useTournament.ts`
plus a provider; icons/motion touch only the panel. This keeps each diff reviewable and existing tests green.

For **TanStack Query**, wrap the app in a single `QueryClientProvider` (a client component mounted in
`layout.tsx`) and rewrite `useTournament` to call `useQuery({ queryKey: ['tournament'], queryFn, refetchInterval })`,
unwrapping the existing `ApiEnvelope<Tournament>` and surfacing `data`/`error`/`loading` with the **same shape**
the only consumer (`RoadmapCanvas`) already destructures — so the call site is unchanged. The route's
liveness-tiered TTL cache stays the source of truth; Query just owns client polling + caching, no duplicated
server state.

For **dates**, replace `Intl.DateTimeFormat` with `date-fns` `format` + `date-fns-tz` `formatInTimeZone`,
parsing the ISO-UTC string and rendering in the user's resolved IANA zone (with a deterministic explicit-zone
path used by tests so assertions don't depend on the CI machine's locale).

**Rejected alternative:** Luxon instead of date-fns. Both are canonical; the stack map names date-fns as the
pick (Luxon only as the acceptable alternative — "pick one, don't ship both"). date-fns is tree-shakeable
(smaller landing-page bundle, which matters for the <150kb JS budget) and pairs cleanly with `date-fns-tz`, so
we follow the map's primary pick.

## Files

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | modify | Add deps: `@tanstack/react-query`, `date-fns`, `date-fns-tz`, `d3-hierarchy`, `lucide-react`, `framer-motion`. Add devDeps: `@types/d3-hierarchy`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `prettier`, `prettier-plugin-tailwindcss`. Add scripts `format`, `format:check`. Verify no duplicate-concern deps. |
| `src/app/providers.tsx` | create | `'use client'` `QueryClientProvider`. Exports `<AppProviders>` wrapping children with a memoized/singleton `QueryClient` (sane defaults: `staleTime`, `refetchOnWindowFocus: false`). <50 lines. |
| `src/app/layout.tsx` | modify | Wrap `{children}` in `<AppProviders>`. Keep fonts/metadata/viewport unchanged. |
| `src/features/roadmap/hooks/useTournament.ts` | modify | Rewrite over `useQuery`. `queryFn` does `fetch('/api/worldcup')`, unwraps `ApiEnvelope<Tournament>`, throws on `success:false` (Query handles error/retry). `refetchInterval: pollMs` (default 45_000). Return the **same** `{ data, error, loading }` shape so `RoadmapCanvas` is untouched. No `setInterval`/`AbortController`/`useRef` hand-rolling. |
| `src/lib/datetime.ts` | create | New single date/timezone façade. Exports `formatDateTime`, `formatTime`, `formatDate`, plus a `resolveTimeZone()` helper. Wraps `date-fns` + `date-fns-tz` (`formatInTimeZone`). Handles `null` ISO → existing fallbacks (`'Date TBD'`, `'--:--'`, `'TBD'`). Pure, no React. <120 lines. |
| `src/features/roadmap/format.ts` | modify | Re-export from `@/lib/datetime` (thin barrel) so all current importers (`MatchNode`, `StatusPill`, `MatchDetailPanel`, tests) keep working with no call-site churn; or delete and repoint imports — see Data Model note. Choose re-export to minimize diff. |
| `src/features/roadmap/layout/d3-bracket-adapter.ts` | create | Thin, tested adapter that builds a `d3.hierarchy` from a `Bracket` and exposes a typed helper (e.g. `bracketHierarchy(bracket)`) returning a `HierarchyNode`. Proves `d3-hierarchy` is wired and gives req #2 a ready entry point. Does **not** replace `computeBracketLayout` (req #2 owns that). Pure, no React. <120 lines. |
| `src/components/panel/MatchDetailPanel.tsx` | modify | Replace the `✕` glyph close button with a lucide `X` icon (`aria-hidden` icon + existing `aria-label="Close match details"`). Convert the slide-in/out from the bespoke CSS transition to a framer-motion `motion.aside` using transform/opacity only, guarded by `useReducedMotion()`. Preserve `inert`/`aria-hidden` focus semantics. |
| `src/hooks/useReducedMotion.ts` | create (if not present) | Small hook wrapping framer-motion's `useReducedMotion` (or `matchMedia`) for the panel; reused by future motion. <30 lines. (Skip if framer-motion's own hook is used directly.) |
| `vitest.config.ts` | modify | Split into two projects OR add `environmentMatchGlobs` so `*.test.ts` (domain) stays `node` and new `*.test.tsx` (components) runs in `jsdom`. Add `setupFiles: ['./vitest.setup.ts']`. Extend coverage `include` to the new `src/lib/**`, `src/app/providers.tsx`, `useTournament.ts`. |
| `vitest.setup.ts` | create | Import `@testing-library/jest-dom/vitest`; register `afterEach(cleanup)` from `@testing-library/react`. <20 lines. |
| `prettier.config.mjs` | create | Prettier config with `plugins: ['prettier-plugin-tailwindcss']` and project style (singleQuote, semi, printWidth 100 to match existing code). |
| `.prettierignore` | create | Ignore `node_modules`, `.next`, coverage, `*.snap`. |
| `src/lib/datetime.test.ts` | create | Unit tests for the date façade (deterministic explicit-zone). |
| `src/features/roadmap/layout/d3-bracket-adapter.test.ts` | create | Unit tests for the d3-hierarchy adapter (node count, depth, leaves). |
| `src/features/roadmap/hooks/useTournament.test.tsx` | create | Component/hook test for the Query refactor (success, error, polling shape) with a mocked `fetch` + `QueryClientProvider` wrapper. |
| `src/components/panel/MatchDetailPanel.test.tsx` | create | Component test: renders, close button has accessible name, kickoff text present, reduced-motion path. |
| `requirements/zoomable-roadmap-graph.md` | modify | Follow-up doc fix: Dagre → d3-hierarchy; add Tailwind styling, TanStack Query for live data, tz lib for kickoff display. Update the "Decision (locked)", "Dependencies", and `useLayoutedGraph`/`lib/layout.ts` references accordingly. |

## Data Model / Types

No domain model changes. Boundary types stay as-is (`Tournament`, `Match`, `ApiEnvelope<T>`, Zod
`tournamentSchema`). New library-facing types only:

```ts
// src/lib/datetime.ts
export function resolveTimeZone(explicit?: string): string;      // explicit ?? user IANA zone (Intl fallback)
export function formatDateTime(iso: string | null, tz?: string): string; // 'Date TBD' on null
export function formatTime(iso: string | null, tz?: string): string;     // '--:--' on null
export function formatDate(iso: string | null, tz?: string): string;     // 'TBD' on null
// Implementation: date-fns-tz `formatInTimeZone(parseISO(iso), tz, 'dd MMM, HH:mm')` etc.
```

```ts
// src/features/roadmap/layout/d3-bracket-adapter.ts
import { hierarchy, type HierarchyNode } from 'd3-hierarchy';
import type { Bracket } from '@/domain/types';
interface BracketTreeDatum { readonly matchId: string; readonly stage: string; }
export function bracketHierarchy(bracket: Bracket): HierarchyNode<BracketTreeDatum>;
```

```ts
// src/features/roadmap/hooks/useTournament.ts (unchanged public shape)
interface TournamentState { data: Tournament | null; error: string | null; loading: boolean; }
export function useTournament(pollMs?: number): TournamentState;
```

```ts
// src/app/providers.tsx
export function AppProviders({ children }: { children: React.ReactNode }): JSX.Element;
```

No new Zod schema is required (no new external boundary is introduced; the existing `/api/worldcup` boundary
remains the validated one). Validation of the envelope inside `queryFn` reuses the existing `ApiEnvelope`
discriminated union — narrow on `success` and throw a typed `Error(message)` on failure.

## Test Strategy

Framework: **Vitest + Testing Library** (component) and the existing **Vitest (node)** domain suite. E2E stays on
Playwright (existing `e2e/` specs must remain green; no new specs mandated by this requirement).

### Behaviors to test (unit / component)
1. **datetime façade (unit):**
   - `formatDateTime`/`formatTime`/`formatDate` with a fixed ISO-UTC input and an **explicit** tz produce a
     stable, expected string (no machine-locale dependence).
   - Null input returns the documented fallbacks (`'Date TBD'`, `'--:--'`, `'TBD'`).
   - Same UTC instant rendered in two different zones yields different wall-clock times (proves tz lib is wired,
     not `Intl`-default).
2. **d3-bracket-adapter (unit):**
   - `bracketHierarchy` over a known mock bracket returns a hierarchy whose leaf count = R32 nodes and whose
     depth matches the round count (R32→Final).
   - Pure: identical input → structurally identical output; no mutation of the input `Bracket`.
3. **useTournament (component/hook):**
   - On `success:true` envelope, exposes `data` and `loading:false`.
   - On `success:false` envelope, exposes `error` message and keeps prior `data` semantics (no crash).
   - `refetchInterval` wiring uses `pollMs` (assert query options / fake timers trigger a second `fetch`).
   - Uses native `fetch` (mocked), not a second HTTP client.
4. **MatchDetailPanel (component):**
   - Close button has accessible name "Close match details" and fires `onClose`.
   - Kickoff row renders text from the date façade for a given match.
   - When `prefers-reduced-motion` is set, no transform-based entrance animation is applied (assert via the
     reduced-motion code path / no `style` transform churn).
5. **Regression guard:** existing domain tests (`standings.test.ts`, `build-bracket.test.ts`,
   `build-graph.test.ts`, `lod.test.ts`, `bracket-layout.test.ts`, mapper/mock tests) **still pass unchanged**
   under the split jsdom/node config.

### Acceptance criteria as testable statements
- All `kickoff` rendering flows through `src/lib/datetime.ts` (grep shows **zero** `new Intl.DateTimeFormat`
  and zero `new Date(...).toLocale*` in `src/` outside the deterministic mock `iso()` fixture builder).
- Client tournament fetching/polling is implemented via `@tanstack/react-query` (`useTournament` contains no
  `setInterval`/manual `AbortController` polling loop).
- `package.json` lists exactly one date lib (`date-fns`/`date-fns-tz`, no `luxon`/`moment`/`dayjs`), one
  data-fetching lib (`@tanstack/react-query`, native fetch only — no `axios`/`ky`), `d3-hierarchy` (+ types),
  `lucide-react`, `framer-motion`, and the four testing-library/jsdom devDeps + prettier (+ tailwind plugin).
- `prettier --check` passes on touched files with Tailwind class ordering applied.
- `requirements/zoomable-roadmap-graph.md` no longer references Dagre and names d3-hierarchy + Tailwind +
  TanStack Query + tz lib.

### Coverage target
≥80% line/branch on the **new/refactored** modules: `src/lib/datetime.ts`,
`src/features/roadmap/layout/d3-bracket-adapter.ts`, `src/features/roadmap/hooks/useTournament.ts`,
`src/app/providers.tsx`. Keep overall suite green; extend `vitest.config.ts` `coverage.include` to cover them.

## Risks & Open Questions

- **Vitest dual environment.** Existing tests assume `environment: 'node'`. Component tests need `jsdom`.
  Mitigation: use `environmentMatchGlobs` (`*.test.tsx` → jsdom, `*.test.ts` → node) or Vitest projects; verify
  the node domain suite is unaffected. Low risk, well-trodden pattern.
- **Timezone source.** `Venue` has no timezone field, so we cannot render true *venue-local* kickoff times. We
  render in the **user's resolved IANA zone** (deterministic explicit-zone in tests). This satisfies "all
  kickoff rendering goes through one tz path" without inventing a domain field. Open question: is user-zone (vs
  a fixed broadcast zone) the desired default? Defaulting to user zone; trivially swappable via the `tz` arg.
- **framer-motion + bundle budget.** Landing-page JS budget is <150kb gzipped. framer-motion is heavy; we use it
  on exactly one non-critical surface. Mitigation: import only `motion`/`AnimatePresence`/`useReducedMotion`;
  consider lazy-loading the panel if the analyzer shows budget pressure. Open question: acceptable to add ~30kb
  for one slide animation, or prefer keeping the existing CSS transition and skip framer-motion? The stack map
  says "add (sparingly)" — plan adds it minimally but flag for reviewer if budget regresses.
- **TanStack Query + Server Components.** No hydration/dehydration of an SSR-prefetched query is added (the page
  is a client `RoadmapCanvas`; initial data still comes from the route handler on first client fetch). This
  preserves current behavior; a future SSR-prefetch is an optional enhancement, not required here.
- **d3-hierarchy adapter is a stub-with-tests, not the real layout.** Risk that it diverges from what req #2
  needs. Mitigation: keep it minimal (just `hierarchy(...)` construction + typed datum) so req #2 extends rather
  than rewrites.
- **Optional libs (shadcn/ui, Zustand, nuqs) intentionally omitted.** If review insists on nuqs for
  `useStageView`, that is an additive follow-up; flagged, not blocking.

## Acceptance Criteria

1. `@tanstack/react-query` is added and `useTournament` is refactored onto `useQuery` with `refetchInterval`
   polling; the hand-rolled `setInterval`/`AbortController` loop is gone; `RoadmapCanvas` call site is unchanged
   (same `{ data, error, loading }`); a `QueryClientProvider` boundary wraps the app.
2. The route handler `/api/worldcup` + Zod (`parseTournament`) remain the validated initial-fetch path; no server
   state is duplicated into a client store.
3. `date-fns` + `date-fns-tz` are added; a single `src/lib/datetime.ts` façade renders all `kickoff` values;
   `format.ts` re-exports it; no `Intl.DateTimeFormat`/`toLocale*` date formatting remains in `src/` (except the
   deterministic mock `iso()` UTC fixture builder, which is a non-goal).
4. `d3-hierarchy` + `@types/d3-hierarchy` are added with a thin, tested `d3-bracket-adapter.ts`; no Dagre/dagre-d3
   dependency exists in `package.json`.
5. `lucide-react` is added and the `✕` close glyph in `MatchDetailPanel` is replaced with an accessible lucide
   icon (accessible name preserved).
6. `framer-motion` is added and applied to exactly one non-graph surface (the detail panel) using transform/opacity
   only, guarded by reduced-motion; React Flow still owns graph motion.
7. `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` are added
   and wired into Vitest via a setup file + jsdom environment for `*.test.tsx`; existing node domain tests stay
   green.
8. `prettier` + `prettier-plugin-tailwindcss` are added with config, ignore file, and `format`/`format:check`
   scripts; `prettier --check` passes on touched files with Tailwind class ordering.
9. Styling is verified Tailwind-v4-only (tokens via `@theme`); no second styling system is present beyond global
   resets/tokens (audit note recorded; no parallel CSS framework).
10. `package.json` reflects the stack map with **no two libraries for one concern** (one date lib, one
    data-fetching lib, native fetch only).
11. New/refactored modules meet ≥80% coverage and the full Vitest suite passes.
12. `requirements/zoomable-roadmap-graph.md` is updated: Dagre → d3-hierarchy, plus Tailwind, TanStack Query, and
    the tz lib for kickoff display.
13. Domain logic (standings, bracket topology, `R32_SEEDING`, stage-order, mock simulator incl. `mulberry32`,
    `drawGoals`, `decide`, `iso()`) is unchanged — no library replaces it.
