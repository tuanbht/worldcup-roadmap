# Implementation Review — Google-style match detail panel (Timeline / Lineups / Stats)

Reviewed the working-tree changes against `plan.md` (rev #4), `requirements/match-detail-panel.md`,
and the acceptance criteria. Gates were run locally and observed (not taken on faith).

## Summary

The implementation is complete, faithful to the plan, and high quality. All 16 acceptance criteria are
satisfied and pinned by meaningful tests. The module boundary (`@` → `./src` only, no `src/ → server/`
crossing) holds; `DETAIL_UNAVAILABLE` lives in `@/data/detail-codes` and is imported by route + hook + tests.
Events are mapped by `TypeLocalized` label, null stats are omitted (not zeroed), win-probability is a labeled
estimate that always sums to 100 (or absent), FIFA payloads are zod-validated and degrade to empty instead of
throwing, the per-match cache is liveness-tiered + single-flight + stale-on-error, and the panel preserves the
`inert`/`aria-hidden`/Escape a11y contract and mobile bottom-sheet. No secrets, no `console.log`, no leftover
TODOs. No CRITICAL or HIGH issues. Approving.

## Observed gate results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS (clean) |
| Tests | `npm run test` (`vitest run`) | PASS — 28 files, **281/281** tests |
| Coverage | `npm run test:coverage` | **95.89%** lines overall; new modules all ≥90% (panel/match-detail 93.54%, FIFA detail modules 92–100%, cache 100%, route 100%, hook 100%) |
| Build | `npm run build` (`vite build`) | PASS — built in ~1s |
| Lint | n/a | No `lint` script exists in this repo; build + typecheck are the static gates |
| E2E | `e2e/match-detail.spec.ts` | Authored; documented as possibly un-runnable when sandbox browsers are unavailable (runs under `test:e2e`, not the unit gate) — acceptable per plan |

## Requested-check verification

- **Mock match → `DETAIL_UNAVAILABLE` (no crash):** route returns HTTP-200 `fail(DETAIL_UNAVAILABLE)`
  (`server/routes/match-detail.ts:32-36`); hook maps it to `status:'unavailable'`
  (`useMatchDetailQuery.ts:33`); panel renders `PanelEmpty` (`MatchDetailPanel.tsx:138`). Tested in
  `match-detail.test.ts` + `MatchDetailPanel.test.tsx`. PASS
- **Events mapped by `TypeLocalized`, never numeric `Type`:** `event-labels.ts` keys on the localized label;
  `match-detail-mapper.ts:229` resolves via `pickLocale(raw.TypeLocalized)`. Proven by
  `event-labels.test.ts` + `match-detail-mapper.test.ts`. PASS
- **Null stats omitted, not zeroed:** `match-detail-stats.ts:57-59` sets passes / passAccuracy /
  shotsOnTarget to `null`; `StatsTab.tsx:95` filters null rows; a null value renders an em-dash, never `0`
  (`StatsTab.tsx:24`). Tested in `match-detail-stats.test.ts`. PASS
- **Win-probability labeled-or-absent:** `estimated: true` always set; `StatsTab` renders an "Estimate" pill
  and hides the bar when `winProbability === null`. `home+draw+away===100` proven exactly in all three overflow
  directions (`win-probability.test.ts`). PASS
- **FIFA payloads zod-validated + degrade gracefully:** tolerant `.passthrough()` schemas
  (`match-detail-schema.ts`); `fetchSection` returns `null` on HTTP / oversized / invalid-JSON / schema
  failure (`match-detail-client.ts:28-38`); mapper degrades null/empty to `EMPTY_MATCH_DETAIL` shape with no
  throw (`match-detail-mapper.test.ts:214`). PASS
- **Per-match cache:** `match-detail-cache.ts` — `Map`-keyed by matchId, TTL tiered by `isLive`, single-flight
  via `inflight`, stale-on-error returns last good snapshot. All four behaviours tested
  (`match-detail-cache.test.ts`). PASS
- **a11y inert/Escape/focus + mobile sheet preserved:** `MatchDetailPanel.tsx` keeps `aria-hidden`/`inert`
  toggle, Escape handler, mobile bottom-sheet classes, lucide `<X aria-hidden>`. Focus never lands in the
  hidden region because of the `inert` pattern (the original panel had no explicit JS focus-restore either —
  parity preserved). Guard tests stay green. PASS
- **No secrets / `console.log`:** grep clean across new source. The only `token` reference is FIFA
  pagination `ContinuationToken`, not a credential. PASS
- **Existing tests still green:** all prior suites pass, including the extended `MatchDetailPanel.test.tsx`
  a11y guards. The five `Match`-literal sites carry `providerRef`, so typecheck holds. PASS

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

**L-1 — Inactive tabs' `aria-controls` reference non-existent panel ids** (`MatchDetailTabs.tsx:68-93`,
`SegmentedControl.tsx:45`). Only the active `tabpanel` is rendered (`id={panelId(active)}`), but every tab's
`aria-controls` is wired to its own panel id via `getControlsId={panelId}`. So the two inactive tabs point at
DOM ids that do not exist. WAI-ARIA APG recommends `aria-controls` reference an element present in the DOM.
The active tab is always correctly wired (the test on `MatchDetailTabs.test.tsx:48-56` asserts exactly that),
and most assistive tech tolerates the dangling reference, so this is non-blocking. Fix options: render all
three panels with `hidden` on inactive ones (then `aria-controls` always resolves), or only emit
`aria-controls` for the active tab.

**L-2 — `IdGroup` captured in the FIFA calendar schema but never consumed** (`schema.ts:27`). `mapGroup`
derives the group from `GroupName`, so the new `IdGroup` field is dead capture. Harmless (the plan listed it as
optional); remove it or wire it if a future need appears.

**L-3 — No `coverage.thresholds` configured** (`vitest.config.ts:26`). The ≥80% AC is enforced only by
observation, not by a failing gate. Observed coverage is comfortably above 80% on every new module, so this
does not block; consider adding a `thresholds` block to make the gate self-enforcing in CI.

## Notes (non-findings)

- The implementer derived `isLive` inside `MatchDetailPanel` (it already holds the resolved `Match`) rather
  than threading it from `RoadmapCanvas` as the plan sketched. This is cleaner and still satisfies AC12
  (liveness from the already-loaded tournament, no extra fetch).
- Shared test fixtures were consolidated under `match-detail/__test-support__/` (excluded from coverage)
  instead of a single `FINAL_MATCH` literal — a reasonable DRY refactor that keeps all `Match` literals valid.
- Stats `shots: 0` for a match with zero attempt events is a real count of zero, correctly distinct from the
  omitted (`null`) unsourced stats — consistent with AC6.

## Verdict

All gates pass; every acceptance criterion is met and tested; the module boundary and a11y contract hold; no
CRITICAL or HIGH issues. The three LOW items are polish, not blockers.

VERDICT: APPROVED
