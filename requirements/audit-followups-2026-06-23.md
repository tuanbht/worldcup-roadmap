# Requirement: Audit follow-ups (2026-06-23)

> Created from a post-cleanup audit (8 agents, adversarial verification, 0 refuted) after CR-1…CR-14 were
> resolved and their requirement docs cleared. **No HIGH/CRITICAL** — the codebase is healthy
> (`tsc` ✅, **607 tests** ✅, `vite build` ✅). These are the remaining refinements + the two pending features.

## Pending features (have their own specs — build these first)

- **`refetch-on-window-focus.md`** — still unimplemented. Code keeps `refetchInterval` in
  `useTournamentQuery.ts:6,38` and `useMatchDetailQuery.ts:14,59`, and `queryClient.ts:16` has
  `refetchOnWindowFocus: false`. Implement per that spec (and update the stale `queryClient.ts:6` comment +
  the `match-detail-panel.md` "short refetch interval while live" line it supersedes).
- **`nearest-match-flag-badge.md`** — still unimplemented (no `isNearest` / `applyNearestFlag` / `data-nearest`
  in `src/`). Implement per that spec, reusing `pickFocusMatchId` from `focus-target.ts`.

## Hardening follow-ups (MEDIUM)

- [ ] **AF-1 · Timeout during response-body read is misclassified.**
      `src/data/providers/fifa/client.ts:63-81` — `fetchCalendarPage` splits the abort-guarded `fetch()` and the
      `await res.json()` into two try/catch blocks. If `AbortSignal.timeout` fires _during_ body streaming, undici
      throws an abort/`TimeoutError` from inside `res.json()`, which the second catch maps to
      `ValidationError`/`UPSTREAM_INVALID` instead of `UpstreamTimeoutError`/`UPSTREAM_TIMEOUT`. No hang (still 502,
      cache `inflight` released), but the wrong code misleads monitoring. **Fix:** re-check `isAbortError(error)`
      in the second catch (throw `UpstreamTimeoutError`), and add a test where `.json()` rejects with an
      abort-named error. (`match-detail-client.ts` is unaffected — single catch degrading to null.)

- [ ] **AF-2 · `deriveMatchStats` hardcodes `status: 'live'` into win-probability.**
      `src/data/providers/fifa/match-detail-mapper.stats.ts:234-237` passes `'live'` even for finished matches.
      Inert today (`estimateWinProbability` only branches on `'scheduled'`), but a latent trap if `'finished'` ever
      gets distinct math, and a semantic mislabel. **Fix:** thread the real status (from `RawMatchLive.MatchStatus`
      or a new `matchStatus` param) into `estimateWinProbability`, and add a pass-through test asserting a finished
      match yields `status:'finished'`.

## Nits (LOW)

- [ ] **AF-3 · `sanitizePictureUrl` accepts protocol-relative URLs** (`//host/x.png`) — `match-detail-schema.ts:37-47`.
      Reject them like `http:` (return null), or document the deliberate acceptance in a test.
- [ ] **AF-4 · CORS preflight echoes arbitrary `Access-Control-Request-Headers`** — `server/cors.ts:19`. Pass
      `allowHeaders: []` to lock the preflight, + an OPTIONS test.
- [ ] **AF-5 · `InteractionModeToggle` uses `role=tablist/tab` with no tabpanels** — `InteractionModeToggle.tsx:70-77`.
      A two-option mode switch should be `role="radiogroup"`/`role="radio"` (or a `<fieldset>`+visually-hidden `<legend>`).
- [ ] **AF-6 · No test for a live `THIRD_PLACE` card** — `build-graph.test.ts` only asserts live state on `FINAL`.
      Add a live-3rd-place case (the CR-1 merge already covers it; lock it with a test).
- [ ] **AF-7 · `match-detail-mapper.stats.ts` is 248 lines** (> the ~200 typical target). Consider splitting the
      event pipeline (`…events.ts`) from the stats/win-probability block.
- [ ] **AF-8 · Stale doc comment** in `src/lib/queryClient.ts:6` references the "45s `refetchInterval`" — fix as
      part of AF/`refetch-on-window-focus`.
- [ ] **AF-9 · Minor abort cleanup** — `client.ts:64-68` `AbortSignal.timeout` timer isn't cancelled if `.json()`
      throws early (use an explicit `AbortController` + `clearTimeout` if timer precision matters); and
      `match-detail-client.ts:52-57` `Promise.all` doesn't cross-cancel the sibling fetch on one timeout (only
      matters if an outer route deadline is added). Both optional.
- [ ] **AF-10 · `prettier --check` fails on 2 requirement docs** — `requirements/refetch-on-window-focus.md` and
      `requirements/nearest-match-flag-badge.md`. Run `npm run format` (code is otherwise prettier-clean).

## Acceptance

- AF-1/AF-2 fixed with the noted tests; AF-3…AF-10 addressed or consciously deferred with a one-line rationale.
- `npm run typecheck`, `npm run test`, `npm run build`, `npx prettier --check .` all green.
- The two pending feature specs are scheduled/implemented; their docs updated on completion.
