# Implementation Review — Timeline-grid layout

**Verdict: APPROVED** — no CRITICAL or HIGH findings; all observed gates pass.

## Summary

The implementation realizes the authoritative `timeline-grid-layout.md` faithfully: one shared
vertical day axis (`computeDayIndex`) drives `y` for every node (group + knockout); groups A–L are
fixed columns; any 2-match (group, day) cell renders side-by-side at `x ± SLOT/2`; the knockout is a
d3-hierarchy center-converging funnel with parent `x` = midpoint of its two `winnerOf` children,
re-centered on the exported `CX`; one `day-marker` per distinct day on the left rail, one
`group-header` per group across the top; all edges route bottom→top (`'b'`→`'t'`), zero left/right
handles. `MatchNode` is reused unchanged (108px, `t`/`b` handles, "Group A · MD1" label, `data-final`).
Standings moved out of the grid into an on-demand `StandingsOverlay`. The plan was followed precisely,
including every `[Rev2:*]` resolution.

I independently re-derived the graph against the mock fixture and confirmed the acceptance criteria
hold numerically (not just via the project's own tests).

## Observed gate results

| Gate | Result |
|------|--------|
| `npm run test` | **PASS** — 18 files, 153 tests passed |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| `npm run build` (vite) | **PASS** — built in ~2s; RoadmapCanvas chunk 255.67 kB / gzip 82.69 kB |
| `npm run test:coverage` | **PASS** — in-scope modules well above 80% |
| `npm run lint` | **N/A** — no `lint` script exists in package.json (pre-existing; not introduced here) |
| `prettier --check` on `src/**` + `server/**` | **PASS** — all source files Prettier-clean |
| Playwright `e2e/timeline-grid.spec.ts` | **chromium PASS (1 passed)**; webkit/mobile project errored only because the webkit binary is not installed in this sandbox (documented env gap, not a code defect) |

Coverage (in-scope modules): `build-graph.ts` 98.62%, `bracket-layout.ts` 100%, `day-axis.ts` 100%,
`group-layout.ts` 92.98%, `layout-constants.ts` 100%. All ≥80% line+branch on the geometry/transform
modules that `coverage.include` measures, as the plan scoped.

## Independent verification (fixture re-derivation)

- 130 nodes = 104 match + 14 day-marker + 12 group-header; 104 match = 72 group + 32 bracket. ✔
- Every match → exactly one match node; no `group` table node remains. ✔
- 56 edges total, **all flow strictly downward** (target.y > source.y), including the 24 feeder edges
  (group-header → R32) and the 2 `loserOf` edges into THIRD_PLACE. ✔
- 32 advance edges (one per non-group bracket slot) and 24 feeder edges (12 groups × 2 seeds). ✔
- Final at `x = 3816 = CX`, `y = 2696 = maxY` (center-bottom). ✔
- KO parent `x` = midpoint of children; per-round span narrows R32 > R16 > QF > SF > FINAL; THIRD_PLACE
  x-adjacent (`Final.x + LEAF_X_PITCH`) on its own earlier day-row. ✔ (covered by passing specs)
- `dayKey` is a real UTC conversion (date-fns-tz), not an `iso.slice` shortcut — pinned by the
  offset-rollover test. ✔

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
- **M1 — No `lint` script.** `package.json` exposes `format`/`format:check` but no `lint`/ESLint.
  The web ruleset assumes an ESLint entrypoint. Not introduced by this change and source is
  Prettier-clean + type-clean, so non-blocking; worth adding an ESLint gate in a follow-up.
  (`package.json:scripts`)

### LOW
- **L1 — `StandingsOverlay` backdrop is a clickable `<div>`** (`StandingsOverlay.tsx:40-43`). Click-out
  to close is wired on a non-interactive element with no keyboard equivalent. Mitigated: a real
  `<button aria-label="Close standings">` exists and receives focus on open, and Esc closes the dialog,
  so keyboard users are not blocked. Consider `aria-hidden` on the backdrop or a button-based scrim for
  strictness.
- **L2 — `RoadmapGraph.nodes/edges` typed `readonly` but built as mutable locals** (`graph-model.ts:71-74`,
  `build-graph.ts:174-205`). The arrays are constructed locally and never expose mutation of the input
  `Tournament` (purity verified via the frozen-input test), so this is cosmetic; `ReadonlyArray` at the
  return boundary would tighten intent.
- **L3 — webkit/mobile e2e cannot run in-sandbox** (missing browser binary). The chromium project
  passes; the spec documents the caveat. Run `npx playwright install` in CI to exercise all projects.

## Notes on requirement conformance

- **Topology** is correctly sourced from the existing `buildBracket` `winnerOf` map (adjacent-slot
  pairing), not invented FIFA adjacency — exactly as the requirement mandates until
  `fifa-regulation-accurate-bracket` lands. The midpoint pass reads real `slot.source.matchId`.
- **TDD rewrite** is honest: `day-axis`/`group-layout`/`bracket-layout`/`build-graph` specs are
  fixture-derived (counts computed from the mock, e.g. 72/32/14/12), assert relations not absolutes,
  and build the graph inside each test so an unimplemented transform fails individually. MatchNode,
  datetime, derive-matchdays, standings, mapper, server, LOD, query, MatchDetailPanel specs untouched
  and green.
- **Standards:** immutable transform (frozen-input safe), pure O(n) layouts, no `console.*` in src,
  semantic HTML (`<time>`, `<button>`, `<section>`, `role="dialog"`), compositor-only animation
  (`transform`/`box-shadow`/`border-color`, `[contain:layout_paint]`), Tailwind tokens, all files
  < 800 lines (largest in-scope: build-graph at 208).
