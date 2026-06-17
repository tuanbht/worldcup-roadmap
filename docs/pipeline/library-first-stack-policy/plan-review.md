# Plan Review (Revision #3): Library-first stack policy

**Reviewer verdict:** APPROVED
**Plan:** `docs/pipeline/library-first-stack-policy/plan.md`
**Requirement:** `requirements/library-first-stack-policy.md`

## Summary

Revision #3 resolves the blocking H1-new from review #2 by taking the **preferred fix: dropping the
speculative `d3-bracket-adapter.ts` module entirely.** This req now adds only the `d3-hierarchy` +
`@types/d3-hierarchy` dependencies and proves the install with a minimal smoke test, leaving
hierarchy construction to req #2 where it is already designed inline. M1-new (lossy datum) dissolves
with the adapter, M2-new (imprecise paths) is corrected throughout, and L1-new/L2-new are folded into
the plan as explicit mitigations and an ordered implementation sequence.

I independently re-verified every load-bearing claim against source — all hold:

- **`useTournament.ts`** hand-rolls `setInterval` + `AbortController` + `useRef` (lines 19, 42-44),
  default `pollMs = 45_000`. The refactor target and preserved public shape (`{ data, error, loading }`)
  are real.
- **`format.ts`** is the *only* `Intl.DateTimeFormat` usage in `src/` (grep confirmed). The mock
  `iso()` at `build-mock-tournament.ts:38` is `Date.UTC().toISOString()` instant-construction, not
  display formatting — correctly excluded as a non-goal.
- The **three date consumers** are `MatchNode.tsx` (`formatDateTime`), `StatusPill.tsx` (`formatTime`),
  `MatchDetailPanel.tsx` (`formatDateTime`); all import from `format.ts`. The barrel must re-export
  `formatDateTime`, `formatTime`, **and** `formatDate` — the Files-table entry lists all three, so the
  barrel is complete and the refactor is genuinely call-site-churn-free.
- **`MatchDetailPanel.tsx`** has the `✕` glyph (line 97) inside the `aria-label="Close match details"`
  button (lines 91-98) and the `aria-hidden`/`inert`/`aria-label="Match details"` always-mounted
  contract (lines 71-86). Icon swap and M2 contract are correctly specified.
- **`RoadmapCanvas.tsx:64`** destructures only `{ data, loading }` — the call site is genuinely
  unchanged by the hook refactor. (File is at `src/components/roadmap/`, as the corrected plan states.)
- **`layout.tsx`** wraps `{children}` directly in `<body>` (line 34) — clean provider insertion point.
- **`globals.css`** is Tailwind v4 (`@import 'tailwindcss'` + `@theme` at lines 1/8 + `@layer base`
  / `@layer components`). The `.pitch-grid`/`.advance-edge`/`.react-flow__*` rules are Tailwind
  `@layer` overrides for the React Flow library, **not** a parallel CSS framework. Grep for
  styled-components/emotion/sass/CSS-modules is clean. Single-styling-system claim is accurate.
- **Req #2 cross-check (the H1-new resolution):** `per-match-nodes-and-orientation/plan.md:138-187`
  imports `hierarchy, tree` directly from `d3-hierarchy` and builds `hierarchy(finalBracketNode,
  childAccessor)` inline with `[home, away]` slot ordering over the full `BracketNode`. It never
  references an adapter / `bracketHierarchy` / `{ root, thirdPlace }`. Dropping the adapter is the
  correct call — a shipped wrapper would be dead, duplicative code with a too-lossy datum.
- **`requirements/zoomable-roadmap-graph.md`** still carries `React + Vite` (line 14), Dagre
  (lines 20, 28-33, 82-84, 127), and `vite.config.ts`/`main.tsx` (lines 42-45, 128) — the follow-up
  doc update is warranted and well-scoped.
- **`playwright.config.ts`** shares a `use` block (lines 12-15) across `chromium` and `mobile`;
  `visual.spec.ts:53` skips `mobile`. The tz/locale pin placement and snapshot-project reasoning hold.
  The visual snapshots run on desktop `chromium` and render kickoff text (via `MatchNode`/`StatusPill`),
  so the regenerate-and-human-review step is correctly required.
- **No Dagre and no duplicate-concern deps** in `package.json`; `@next/bundle-analyzer` and the
  `analyze` script already exist, so the framer-motion budget gate is executable as written.

## CRITICAL
_None._

## HIGH
_None._

## MEDIUM
_None._

## LOW

### L1 — Pin the date-fns locale explicitly rather than relying on the default
The `datetime.ts` impl (plan line 178) calls `formatInTimeZone(parseISO(iso), tz, fmt)` with no
`locale` and asserts "en-US tokens are locale-stable." This is *correct*: date-fns defaults its
`locale` to `enUS` and does **not** read the machine locale (the opposite of the old
`Intl.DateTimeFormat(undefined, …)`), so `MMM` always renders English month abbreviations — which is
the determinism win here. Nicety only: pass `{ locale: enUS }` explicitly (import from
`date-fns/locale`) so the stability is self-documenting and future-proof against a date-fns default
change. Non-blocking.

### L2 — Note that `formatDate` currently has no runtime consumer
Grep shows only `formatDateTime` and `formatTime` are imported in `src/`; `formatDate` has no call
site today. Keeping it exported from the barrel is fine for contract completeness, and the test plan
covers it, but the plan should note it is presently unused so a future reader doesn't hunt for a
missing consumer. Documentation-only.

## What's good (keep)
- H1-new resolved via the *preferred* drop-the-adapter path, verified against req #2's actual design.
  No tested module ships without a consumer; no two hierarchy builders for one concern.
- TanStack Query / Server Components tension resolved correctly: route handler + Zod stay the
  validated initial fetch; Query owns client polling/cache only; `import 'server-only'` TTLs stay
  server-side. No duplicated server state.
- framer-motion behind a deterministic analyzer budget gate (add-only-if-it-fits, else install-but-
  unused) against the <150 kb landing budget — decided, not deferred to the reviewer.
- Vitest dual-environment split (`environmentMatchGlobs`: `.test.tsx → jsdom`, `.test.ts → node`) +
  widened `include` keeps the existing node domain suite green.
- date-fns over Luxon justified per the map (tree-shakeable, pairs with date-fns-tz); native `fetch`
  retained under Query; exactly one date lib, one data-fetching lib. No duplicate-concern deps.
- Non-goals respected: `computeGroups`, `buildBracket`, `R32_SEEDING`, `stage-order`, `mulberry32`,
  `drawGoals`, `decide`, `iso()` all explicitly excluded. Follow-up doc reconciliation planned.
- Ordered implementation sequence makes the snapshot chicken-and-egg explicit with a mandatory
  human-review-the-kickoff-diff step (L2-new).

## Verdict
**VERDICT: APPROVED** — no CRITICAL or HIGH issues remain. The prior blocking H1-new is resolved by
dropping the unused adapter, verified against req #2's own plan. The two LOW items are optional polish
the implementer may fold in without re-review.
