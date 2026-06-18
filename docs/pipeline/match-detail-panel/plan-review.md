# Plan Review — Google-style match detail panel (rev #4)

Reviewed: `docs/pipeline/match-detail-panel/plan.md` (revision #4) against
`requirements/match-detail-panel.md` and the live codebase.

## Summary

Rev #4 targets the two Required Changes from the rev #3 review (H-1 and M-1). I re-verified
both fixes against source, along with every carried-forward reuse claim. Both blockers are
fully and correctly resolved, and no new defect was introduced.

**H-1 (layering inversion) — RESOLVED.** The shared `DETAIL_UNAVAILABLE` constant now has its
canonical home in a new client-importable `src/data/detail-codes.ts` (Files table; Data Model
section, plan line 134). The route (`server/routes/match-detail.ts`), the hook
(`src/features/roadmap/hooks/useMatchDetailQuery.ts`), the route test, and the panel test all
import it via `@/data/detail-codes`. `server/routes/error-mapping.ts` only *re-exports* it for
route convenience. I independently confirmed:
- The `@` alias maps to `./src` ONLY in all three configs (`vite.config.ts:23`,
  `vitest.config.ts:15`, `tsconfig.json:16-18`); there is no `server/` alias.
- Zero files under `src/` import from `server/` today (grep returned no matches) — so the
  rev #3 design would have been the first such crossing. The rev #4 placement avoids it and
  honors the documented module boundary (server depends DOWN on `@/data` + `@/domain`, never
  the reverse).

**M-1 (coverage config edit not tracked) — RESOLVED.** `vitest.config.ts` now appears in the
Files table (plan line 117) with the exact additions: `src/components/panel/match-detail/**`,
`src/data/cache/match-detail-cache.ts`, `src/features/roadmap/hooks/useMatchDetailQuery.ts`. I
confirmed against `vitest.config.ts:28-37` that these three are genuinely absent from the
current `coverage.include` globs while `src/data/providers/**` and `server/routes/**` (covering
the FIFA modules + the new route) are already present. The ≥80% AC (AC16) will no longer
silently exclude the new panel/cache/hook code.

## Re-verified reuse / accuracy claims (all hold)

- **H-A (typecheck blast radius).** Grepping `providerMatchId:` returns exactly the five
  `Match`-literal sites the plan enumerates: `fifa/mapper.ts:102`, `mock/build-mock-tournament.ts:106`
  (`makeMatch`, lines 104-117, routes all group/third-place/Final paths), `standings.test.ts:24`
  (`gm` helper), `derive-matchdays.test.ts:15` (`mkMatch`), `MatchDetailPanel.test.tsx:41`
  (`FINAL_MATCH`). `match.ts:50` and `tournament-schema.ts:37` are type/schema declarations, not
  literals. No sixth literal exists. AC16 holds with `providerRef` required.
- **M-A / M-B.** `Match.home/away` is the `TeamRef` union (`match.ts:56-57`); `StandingRow.team`
  is a full `Team`; `Group.name` is the letter and `Group.table` is `readonly StandingRow[]`
  with 1-based `position` (`group.ts:23-27`). The unwrap-at-call-site helper signature is exactly
  correct.
- **M-C.** Structural `c.json(fail(DETAIL_UNAVAILABLE, …), 200)` flow; `fail(code, message)`
  (`envelope.ts:15`) takes exactly two args. No error class needed; `errors.ts` untouched.
- **Cache / env / route / client reuse.** `tournament-cache.ts` has the three behaviours +
  `resetTournamentCache()`; `env.ts:12-13` uses the `z.coerce.number().int().positive().default(...)`
  shape the new TTLs copy; `client.ts:5,9` `BASE`/`HEADERS` are module-local and extractable (M1);
  `worldcup.ts:7-42` holds `mapError`/`isRepositoryErrorShape`/`CACHE_CONTROL` extractable to
  `error-mapping.ts` with the `as 429 | 500 | 502` narrowing kept local (M5); `server/index.ts:14`
  uses `app.route('/', worldcup)`, matching the planned `matchDetail` addition.
- **H3.** `SegmentedControl.tsx` has `role="tablist"`/`role="tab"`/`aria-selected` but no
  `aria-controls`, `id`, `onKeyDown`, or roving tabindex — the gap is real; the additive
  optional-props plan keeps the only other consumer (`StageToggle`) byte-identical.
- **L-2.** `repository-factory.ts:21` — `auto` = `FifaRepository(new MockRepository())`, so a FIFA
  outage transparently serves mock matches (`providerRef: null` → universal `DETAIL_UNAVAILABLE`).
  Neutral empty-state copy guidance is appropriate.

## Completeness / architecture / test strategy

- Every requirement clause is addressed: nullable domain types in `src/domain/types/`; the Hono
  `GET /api/worldcup/match/:matchId/detail` endpoint with per-match liveness-tiered cache,
  single-flight, stale-on-error; ID mapping via `providerRef` (FIFA-filled, mock/test → null);
  zod schemas + mapper + fetcher under `src/data/providers/fifa/`; label-based event mapping
  (never numeric `Type`); stats derived by event counting with unavailable stats OMITTED (not
  faked 0s); labeled win-probability estimate (or omitted); the 3-tab redesign preserving
  inert/Escape/focus + mobile sheet; skeleton/empty/error states; `<img loading="lazy" width
  height referrerPolicy="no-referrer">` headshots with initials fallback.
- Architecture is sound: a parallel data path mirroring the proven tournament path; the eager-embed
  alternative is explicitly rejected with valid reasoning (×104 FIFA calls, aggregate coupling,
  contradicts on-demand requirement). Files stay focused and the module boundary is the spine.
- TDD matrix is complete and testable: pure-module unit tests (mapper, stats, win-prob,
  event-labels, formation-layout, view helpers) from synthetic fixtures; route test via the
  established `vi.doMock`/dynamic-import/`vi.resetModules` seam; component tests via Testing
  Library with a mock `MatchDetail`; extended (not broken) panel a11y tests with the Venue drop +
  Kick-off rewrite landing on real existing assertions (`MatchDetailPanel.test.tsx:30-31`).
  Edge/error paths enumerated (empty payload → `EMPTY_MATCH_DETAIL`; unknown id → unavailable;
  429 → mapped fail; null stats omitted; null win-prob hidden; sum-to-100 in all overflow
  directions). ≥80% coverage now correctly gated after the M-1 config edit.

## Non-functionals

- Security: no secrets; FIFA boundary zod-validated; hotlinked headshots use
  `referrerPolicy="no-referrer"`; Vite SPA has no CSP allowlist to amend (accurate).
- Performance: on-demand per-match fetch + per-match cache + live-only `refetchInterval` matches
  the requirement.
- Error handling: degrade-to-empty (not error page) for blocked/oversized/empty payloads is
  explicit and consistent with `client.ts` discipline.

## Findings

### LOW

**L-1 — `IdStage` capture remains an unverified live-payload assumption (carried from L-A).** The
plan flags this prominently (Risks §) with a graceful-`null` degradation path and a live-probe
action item before finalizing the mapper. `rawMatchSchema` currently only `.passthrough()`es
`IdStage` (`schema.ts:22-44`), confirming it is not yet captured. Acceptable as planned — the
risk is that the feature is "dark" (universally unavailable) for FIFA matches if absent, but it
will not crash, and `mapper.test.ts` proves both branches. No change required to approve.

## Verdict

Both rev #3 blockers (H-1 client→`server/` import; M-1 untracked coverage edit) are correctly
and completely resolved, verified against source. All carried-forward resolutions remain
accurate. The only open item is the well-flagged, non-blocking `IdStage` assumption (L-1). No
CRITICAL or HIGH issues remain.

VERDICT: APPROVED
