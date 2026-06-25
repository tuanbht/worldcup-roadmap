# Requirement: Codebase-review fixes — error resilience, bracket correctness & cleanup

> Source: full-codebase review (39 agents, 5 subsystems, adversarial verification — 7 refuted).
> Validation at review time: `tsc` ✅, **665 tests** ✅, `vite build` ✅, `prettier --check` ❌ (1 file).
> **Decision: REQUEST CHANGES** — 2 HIGH themes. Split into pipeline requirements as needed; R1/R2 first.

## Context

The app is a pure FIFA-direct SPA with **no backend safety net**, so client-side resilience is now load-bearing:
any module-eval throw, render error, or fetch failure currently blanks the whole page with no feedback. The review
also found one real bracket-content bug and a tail of dead-code / a11y / perf cleanups.

---

## REQUIRED (HIGH)

### R1 · App-level error resilience (one theme, 3 failure modes → blank white SPA)

The review flagged this from four subsystems; all converge here.

- **No React error boundary anywhere** (`src/main.tsx:20`, `src/App.tsx`, `src/components/roadmap/RoadmapCanvas.tsx:195`).
  Any render-time throw (malformed node datum, a node-renderer null-deref, a React Flow assertion) unmounts to a blank page.
- **`fifa-config.ts:30` throws at module-eval** — `FifaConfigSchema.parse(import.meta.env.…)`; an invalid
  `VITE_FIFA_PROVIDER` (build-time typo) throws a synchronous `ZodError` before React mounts → blank page, no message.
- **Tournament fetch error is swallowed** — `RoadmapCanvas.tsx:33` ignores `useTournamentQuery`'s error; a failed load
  shows an empty canvas with no feedback (and with `auto`→mock fallback this mostly hides, but a forced-`fifa` failure won't).
- **Fix:** (a) add a root `<ErrorBoundary>` (and one around the canvas + the detail panel) rendering a user-facing error
  screen; (b) fail-soft the config — wrap the parse in try/catch falling back to all-defaults (or
  `z.enum([...]).catch('auto')`) with a dev `console.warn`; (c) surface `useTournamentQuery`'s `error` as a visible
  retry/error state. Add tests for the boundary fallback and the bad-config path.

### R2 · `buildBracket` shows a placeholder instead of the real advancing team

`src/domain/bracket/build-bracket.ts:93-100` (and `buildThirdPlace` :136-141). When a real later-round `Match` exists
but its `home`/`away` is still a **placeholder** (FIFA creates fixture _shells_ with `PlaceHolderA/B` and no `IdTeam`
until teams resolve — see `mapper.ts:53-62`), the `match ? match.home : …` guard uses the placeholder and **bypasses
the `decidedTeam` winner-propagation path**, so a R16/QF/SF/Final card shows a generic placeholder even though the
finished feeder's winner is derivable. This defeats the module's documented contract (lines 47-48).

- **Fix:** `homeTeam = (match && isResolved(match.home)) ? match.home : (decidedTeam(top, matchById, 'winner') ?? placeholderRef(...))`
  and the symmetric away/third-place variants (`isResolved` is already imported). Add a test: finished feeder + placeholder
  shell ⇒ the parent shows the real team.

---

## RECOMMENDED (MEDIUM)

- **M1 · `match-detail-client.ts:57-59` swallows every failure silently** — abort, 403/bot-block, schema regression all
  collapse to `null` with zero observability → a permanently-empty "ready" detail panel. Log non-abort errors (via a small
  logger, honoring the no-`console` rule) or return a discriminated result.
- **M2 · Dead exports** — `toApiError` (`errors.ts:45`, server-era leftover) and `stageOrderIndex` (`stage-order.ts:52`)
  have zero consumers. Remove.
- **M3 · `win-probability.ts:31` `progress()` doesn't handle >90′ (extra time)** — clamp/extend so ET minutes don't skew.
- **M4 · `build-mock-tournament.ts:9` re-declares `GROUP_LETTERS`** instead of importing the canonical export — dedupe.
- **M5 · a11y:** `SegmentedControl.tsx:37` (StageToggle) uses `role=tablist/tab` with no tabpanels → use `radiogroup/radio`;
  `RoadmapCanvas.tsx:184` loading overlay lacks `aria-busy`/`aria-live`; `StandingsOverlay.tsx:23` dialog has no focus trap
  (Tab escapes to the dimmed canvas).
- **M6 · `NearestBadge.tsx:37` permanent `will-change:transform`** on a static chip — drop it (or scope to the animation).
- **M7 · Missing tests** — `assembleTournament` has no direct unit test; `vitest.config.ts:28` coverage `include` omits
  `team-focus.ts`/`useFocusedTeam.ts` though both have tests.

## OPTIONAL (LOW — grouped)

- **Correctness nits:** event sort uses `parseMinute`→0 for null minutes (misorders unknown-minute events,
  `match-detail-mapper.events.ts:179,90`); `standings.ts:115` form-sort non-deterministic on tied kickoff;
  `build-graph.ts:270` day label uses first-seen (not earliest) kickoff; `useStageView.ts:26` no SSR guard.
- **Consistency:** `flag-url.ts:5` hardcodes `api.fifa.com` independent of `VITE_FIFA_BASE_URL`; image `PictureUrl` in the
  calendar `schema.ts:10` isn't run through the `https:` sanitizer the detail schema uses; `EMPTY_MATCH_DETAIL` is a
  factory named like a const.
- **Perf:** add `<link rel="preconnect" href="https://api.fifa.com">` to `index.html`; set `onlyRenderVisibleElements`
  on `<ReactFlow>`; `dayKey` resolves the timezone per-match (hoist once); `applyNearestFlag` maps all nodes when id is
  null; `MatchNode`/`member-edge` animate non-compositor `border-color`/`box-shadow`/`stroke-width`.
- **Docs/format:** `docs/code-review-vite-hono-rework.md` still describes the deleted backend (delete/annotate); run
  `npm run format` on the failing `requirements/*.process.md`.

## Acceptance

- R1 + R2 implemented with tests (boundary fallback, bad-config fail-soft, fetch-error UI, bracket placeholder→real).
- M1–M7 addressed or consciously deferred with a one-line rationale; LOWs as capacity allows.
- `npm run typecheck`, `npm run test`, `npm run build`, `npx prettier --check .` all green.
