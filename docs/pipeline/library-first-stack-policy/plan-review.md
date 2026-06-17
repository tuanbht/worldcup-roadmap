# Plan Review: Library-first stack policy

**Reviewer verdict:** CHANGES_REQUESTED
**Plan:** `docs/pipeline/library-first-stack-policy/plan.md`
**Requirement:** `requirements/library-first-stack-policy.md`

## Summary

This is a strong, well-scoped plan. Its codebase claims are accurate — I verified each
against the source: `useTournament.ts` does hand-roll `setInterval`/`AbortController` polling;
`format.ts` does use `Intl.DateTimeFormat(undefined, …)`; the three named consumers
(`MatchNode`, `StatusPill`, `MatchDetailPanel`) all import from `format.ts`; `MatchDetailPanel`
uses a `✕` glyph; `layout.tsx` has no provider; `vitest.config.ts` is `environment: 'node'`;
no Dagre or duplicate-concern deps exist in `package.json`. The non-goals handling (domain
logic untouched, `mulberry32` kept) is correct, and the "re-export `format.ts` from a new
`@/lib/datetime` façade" approach is the right low-churn move.

It is **not** ready to approve as written. Two issues block: (1) the **d3-hierarchy adapter is
under-specified and structurally non-trivial** — the `Bracket` type has no `children`, so the
plan's `bracketHierarchy(bracket)` cannot be a one-line `hierarchy(...)` call and its stated
test ("leaf count = R32, depth = round count") will not hold without a reconstruction strategy
the plan never defines; and (2) the **date-format refactor will change visible kickoff text in
node cards, which are captured by the existing Playwright visual snapshots** — yet the plan
asserts "existing E2E specs remain green" with no snapshot/timezone-pinning mitigation. Several
medium gaps round it out.

---

## CRITICAL

_None._

## HIGH

### H1 — d3-hierarchy adapter is under-specified and the stated tests can't pass as described
`src/domain/types/bracket.ts` models `Bracket` as a **flat** `rounds: BracketRound[]`; there is
**no nested `children`**. Parent→child links are encoded indirectly via `BracketSlot.source`
(`{ kind: 'winnerOf' | 'loserOf', matchId }`). `d3.hierarchy(data, children?)` needs either a
child-accessor or a stratified id/parentId pair. The plan's Data-Model snippet
(`hierarchy(bracket) → HierarchyNode<BracketTreeDatum>`) and its test ("leaf count = R32 nodes
and depth matches round count") **cannot be satisfied** by passing a `Bracket` to `hierarchy()`
directly — the adapter must first reconstruct the tree by resolving `winnerOf` references into
parent→child edges. Additionally:
- **The Final is the root, R32 are leaves** — the tree must be built root-down from the Final
  walking `winnerOf` sources, or via `d3.stratify()` keyed on `matchId`/parent-matchId.
- **`THIRD_PLACE` does not belong to the single binary tree** — it is a `loserOf`-fed sibling of
  the Final. A naive stratify/hierarchy over all rounds yields a forest or a wrong depth. The
  plan's depth/leaf-count assertions implicitly assume the clean R32→Final binary tree and never
  say how THIRD_PLACE is handled.
**Fix:** Specify the reconstruction algorithm explicitly: root = the Final node; children of a
node = the (≤2) nodes whose `home.source`/`away.source` is `winnerOf` that node's `matchId`;
exclude (or explicitly attach) `THIRD_PLACE`. State whether you use a `children` accessor or
`d3.stratify`. Update the test expectations to the real numbers (16 R32 leaves, depth 4 for
R32→Final) and add a case asserting THIRD_PLACE handling. This keeps the adapter genuinely
"ready for req #2 to extend rather than rewrite."

### H2 — Date refactor changes rendered kickoff text → existing Playwright visual snapshots will break
`MatchNode.tsx:69` renders `formatDateTime(data.kickoff)` as **visible text** inside every match
card, and `StatusPill` renders `formatTime(kickoff)`. Those cards are inside
`.react-flow__viewport`, which the existing visual specs snapshot at 320/768/1024/1440
(`e2e/visual.spec.ts`), masking only `img`, **not text**. The current `format.ts` uses
`Intl.DateTimeFormat(undefined, …)` (machine-default zone); the new façade renders via
`formatInTimeZone` in the **user's resolved IANA zone** (or an explicit zone). If the resolved
zone or the formatted pattern differs from whatever produced the committed snapshots, every
visual test fails. `playwright.config.ts` does **not** pin `use.timezoneId`, so the snapshots are
locale/zone-dependent today. The plan claims "existing E2E specs remain green" — that claim is
unverified and likely false.
**Fix:** (a) Pin a deterministic zone for E2E by adding `timezoneId` (and ideally `locale`) to
the Playwright `use` block so kickoff text is reproducible; and/or (b) explicitly include
"regenerate visual snapshots (`test:e2e:update`) and review the kickoff-text diff" as a planned
step. Decide and document whether the production default is user-zone or a fixed broadcast zone,
because that choice determines the snapshot baseline. Add an acceptance criterion that the visual
suite passes (regenerated if intentionally changed).

## MEDIUM

### M1 — `format.ts` keeps the same output format, or the change is intentional? Be explicit
The new façade is specced as `formatInTimeZone(parseISO(iso), tz, 'dd MMM, HH:mm')`. The current
`Intl` output is `'02 Jun, 14:30'`-style (`day:'2-digit', month:'short', hour/minute:'2-digit'`).
`'dd MMM, HH:mm'` is close but not guaranteed identical (e.g. `Intl` may localize the
month/separator; 12h vs 24h differs by locale). Since `format.ts` is the visible-text source,
state whether the wall-clock string is intended to stay byte-identical (preserves snapshots) or
intentionally change (requires M-H2 snapshot work). Tie the unit-test golden strings to the
explicit-zone path so they don't depend on the CI machine.

### M2 — framer-motion on the panel risks regressing the verified `inert`/`aria-hidden`/focus semantics
The panel is **always mounted** and toggles `inert`/`aria-hidden`/`translate-x-full` with a CSS
transition; `e2e/roadmap.spec.ts` asserts the complementary region is visible with
`aria-hidden="false"` after opening. Converting to `motion.aside` + `AnimatePresence` typically
**unmounts** on close, which would change that contract and the focus-trap behavior the comment
in `MatchDetailPanel.tsx:74-77` deliberately documents (WCAG 4.1.2 / axe `aria-hidden-focus`).
The repo also already disables motion under `prefers-reduced-motion` in `globals.css:166`.
**Fix:** Specify that the panel stays mounted (animate via `animate`/`variants` on the persistent
element, not `AnimatePresence` unmount), preserve `inert`/`aria-hidden`/`aria-label="Match
details"`, and keep `e2e/roadmap.spec.ts` green. Also weigh whether framer-motion earns its
~30–40kb here at all — the existing compositor-only CSS transition already satisfies the
requirement; the stack map says "add sparingly," which can legitimately mean "do not add for a
single slide that CSS already handles." Justify the dep or drop it to a CSS transition and note
framer-motion as available-but-unused.

### M3 — Bundle-budget open question is left unresolved, not decided
The plan flags framer-motion (~30kb) against the <150kb landing budget as an **open question for
the reviewer**. A plan should resolve this, not defer it. There is no analyzer baseline cited.
**Fix:** State the current gzipped landing JS (run `npm run analyze`) and the projected delta, and
make the call: add framer-motion only if it fits with margin; otherwise keep CSS. Don't leave a
budget decision as a runtime surprise.

### M4 — Package name for Framer Motion is ambiguous
The requirement table names the package **`motion`** ("Framer Motion (`motion`)"); the plan
consistently says **`framer-motion`**. These are two different npm package names for overlapping
APIs (`motion` is the newer unified package; `framer-motion` is the classic one). Pin exactly one
and match the import paths.
**Fix:** Choose `framer-motion` (classic, `framer-motion`/`framer-motion/...` imports,
`useReducedMotion` exported) **or** `motion` and state it in `package.json` + the Files table so
the implementer doesn't install the wrong one.

### M5 — TanStack Query "live polling" should honor the env-driven TTLs, not a hardcoded 45s
The requirement explicitly notes "`env.ts` already defines live/idle cache TTLs" and ties polling
to liveness (the mock has a live Final). `src/data/config/env.ts` exposes
`WC_CACHE_TTL_LIVE_MS` (30s) / `WC_CACHE_TTL_IDLE_MS` (10m), but those are **server-only**
(`import 'server-only'`) and cannot be read in the client `useQuery`. The plan hardcodes
`refetchInterval: 45_000` with no link to liveness. That's acceptable for parity with today's
behavior, but the requirement's intent (poll faster when something is live) is dropped silently.
**Fix:** Either (a) explicitly state that client poll cadence stays a fixed `pollMs` default and
that liveness-aware TTL remains server-side (current behavior preserved — fine, just say so), or
(b) plan a dynamic `refetchInterval` callback keyed on whether `data` contains a live match. Don't
leave the relationship to the env TTLs unaddressed.

### M6 — `RoadmapCanvas` does not consume `error`; "same shape" claim is slightly off
The plan repeatedly says the call site destructures `{ data, error, loading }`. It actually does
`const { data: tournament, loading } = useTournament();` (`RoadmapCanvas.tsx:64`) — `error` is
never read or rendered anywhere. Returning the same `{ data, error, loading }` shape is correct
and safe, but note that the app currently has **no user-facing error surface**. If TanStack Query
changes error/retry timing, nothing displays it. Minor, but the plan's premise ("surface error
with the same shape the consumer destructures") misstates the consumer.
**Fix:** Correct the claim, and decide whether to (optionally) wire the now-available `error` into
a visible state, or explicitly keep error UX out of scope.

## LOW

### L1 — Vitest config: `include` glob only matches `*.test.ts`, not new `*.test.tsx`
`vitest.config.ts:10` is `include: ['src/**/*.test.ts']`. The plan adds `*.test.tsx` component
tests; the include pattern (and any `environmentMatchGlobs`) must be widened to `*.test.{ts,tsx}`
or the new component tests won't run. The plan mentions splitting environments but not updating
`include`. Call it out explicitly.

### L2 — `useTournament` error-on-stale behavior changes subtly under Query
Today, on a fetch throw with existing data, the hook keeps `data` and **suppresses** the error
(`error: prev.data ? null : message`). TanStack Query will set `error` truthy on failed refetch
even when `data` is still present (keepPreviousData). Since nothing renders `error` (see M6) this
is harmless, but the test "on `success:false` … keeps prior `data` semantics (no crash)" should
assert the new, Query-accurate behavior, not the old suppression logic.

### L3 — Coverage: `providers.tsx` is near-untestable in isolation; don't over-promise 80%
The plan lists `src/app/providers.tsx` under the ≥80% coverage target. A thin
`QueryClientProvider` wrapper has little branchable logic; chasing 80% line/branch there is
low-value. Prefer covering it transitively via the `useTournament` test wrapper and drop the
explicit per-file target for the provider, or keep it but acknowledge it's trivially covered.

### L4 — Follow-up doc edit should also reconcile `zoomable-roadmap-graph.md`'s Vite stack lines
The follow-up correctly retargets Dagre → d3-hierarchy and adds Tailwind/TanStack/tz. While there,
that spec still says "React + **Vite**" and shows a `vite.config.ts`/`main.tsx` SPA tree
(`zoomable-roadmap-graph.md:14, 40-65, 82-85`), which contradicts the Next 15 reality this policy
affirms. Note in the plan that these references should be reconciled (or explicitly left, with a
reason) so the two specs don't conflict.

---

## What's good (keep)
- Accurate, verified codebase claims; clean per-concern surgical refactors.
- Correct non-goals: domain logic, `mulberry32`, `iso()` fixture builder all excluded.
- `format.ts` → `@/lib/datetime` re-export keeps call sites churn-free across the 3 consumers.
- Deterministic explicit-zone date tests (no machine-locale dependence) — exactly right.
- No duplicate-concern deps; native `fetch` retained under Query; no axios/ky; one date lib.
- Optional libs (shadcn/Zustand/nuqs) correctly noted-not-forced; Playwright not re-added.

## Verdict
**VERDICT: CHANGES_REQUESTED** — resolve H1 (adapter design + test reality) and H2 (visual
snapshot / timezone determinism) before implementation; address the MEDIUM items or justify them
in the revised plan.
