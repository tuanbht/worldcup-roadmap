# Implementation Review — Migrate Next.js → Vite + React SPA + Hono API

**Verdict: APPROVED** — no CRITICAL or HIGH issues; all gates pass.

## Summary

This is a clean, faithful hard-cutover. Next.js is fully removed and replaced by a Vite + React SPA
plus a ~60-line Hono Node API, exactly as the requirement and plan specify. The preserved layers
(`src/domain/**`, `src/data/**`, `src/features/**`, `src/components/**`, including the LOD work) carry
over unchanged — `src/data/config/env.ts` lost only its `import 'server-only'` line, the sole permitted
edit. The two new test areas (Hono route + TanStack Query hook) exist, pass, and hit 100% coverage. I
verified every acceptance criterion against the running code, not just claims.

## Observed gate results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** (clean, no errors) |
| Tests | `npm run test:coverage` | **PASS** — 9 files, 70 tests, 0 failures |
| Coverage | v8 | **92.81% stmts / 87.86% branch** overall; new code: `server/routes/worldcup.ts` **100%**, `useTournamentQuery.ts` **100%** — exceeds 80% target |
| Build | `npm run build` (`vite build`) | **PASS** — static SPA in `dist/`, built in ~0.6s |
| Runtime (API) | `vite-node server/index.ts` + `curl` | **PASS** — `GET /api/worldcup` → 200, identical envelope + `Cache-Control` |
| E2E | `npx playwright test` | **NOT RUN** — Playwright browsers unavailable in this environment (documented gap; specs + config updated) |

### Bundle (vs. landing budget < 150 kB JS gz)
- Initial `index` JS: 226.87 kB raw / **71.04 kB gz** — under budget.
- React Flow lazy-split into a separate chunk (212 kB raw / 69.48 kB gz) behind `React.lazy` — kept out of initial load as required.
- CSS: `index` 41.64 kB / 7.92 kB gz + lazy `RoadmapCanvas` 15.87 kB / 2.67 kB gz.

## Acceptance criteria verification

1. **No Next remnants** — `grep -nE "next|server-only|eslint-config-next|bundle-analyzer" package.json` → none. `package-lock.json` has 0 `next` entries. New deps (`vite`, `@tanstack/react-query`, `hono`, `@hono/node-server`, `@fontsource/archivo`, `@fontsource/inter`, devDep `concurrently`) all present; `tsx` removed. ✅
2. **No `next.config.ts`/`next-env.d.ts`/`src/app/`** — all absent. ✅
3. **No `next/*` or `server-only` imports** — `grep` for actual import statements returns nothing; the only textual matches are docstring/comment references. ✅
4. **`vite build` succeeds**, static SPA emitted to `dist/`. ✅
5. **`tsc --noEmit` passes** for `src/**`, `server/**`, `e2e/**`, config files; `@/` resolves in `server/**` via `tsconfig paths`. ✅
6. **Domain/data/features tests pass unchanged** — `lod`, `mapper`, `standings`, `build-bracket`, `bracket-layout`, `build-mock-tournament`, `build-graph` all green; `WC_PROVIDER=mock` env addition altered none of them (they call `buildMockTournament()` directly). ✅
7. **`GET /api/worldcup` (Hono) returns the same `ApiEnvelope<Tournament>`** — verified at runtime: `success: true`, `error: null`, keys `data,error,success`, `matches.length === 104`, `groups.length === 12`, `meta.provider === 'mock'`, and the identical `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` header the old Next route set. Error path tested for 429/502/500 fail envelopes. ✅
8. **TanStack Query, no hand-rolled polling** — `useTournamentQuery` uses `useQuery({ queryKey: ['tournament'], refetchInterval: 45_000 })`; `useTournament.ts` deleted; `grep setInterval(` over `src` returns no call sites (only comments). ✅
9. **`RoadmapCanvas` destructures `{ data, loading }`**, Legend reads `tournament?.meta.provider ?? null`, LOD `data-lod={lod}`, loading overlay, and all React Flow props unchanged. ✅
10. **FIFA fetch/cache stays server-side** via `vite-node` — single-flight + stale-on-error cache retained in `tournament-cache.ts`; no FIFA fetch moved to the browser. ✅
11. **Favicon preserved byte-for-byte** — `public/icon.png` SHA1 `f39a163c…` and 2830 bytes match the old `src/app/icon.png` from git exactly; copied into `dist/icon.png` (same hash); referenced via `<link rel="icon" href="/icon.png">`. ✅
12. **`global.css` moved verbatim** — `diff` vs the old `globals.css` shows the ONLY change is the two added `--font-archivo`/`--font-inter` vars in `:root`; `@theme` tokens and `[data-lod]` LOD rules untouched and present in built CSS. ✅
13. **`npm run dev`** runs both `vite` and `vite-node --watch server/index.ts` via `concurrently -k`; proxy `/api` → `:8787` defined for both `server` and `preview`. ✅
14. **Two new test areas pass with ≥80% coverage** — `server/routes/worldcup.test.ts` (11 tests, `WC_PROVIDER=mock` pinned before dynamic import) and `useTournamentQuery.test.tsx` (7 tests, jsdom pragma); both new modules at 100% coverage. ✅
15. **Playwright config** — `baseURL: http://localhost:3217`, `webServer` is a two-entry array (preview SPA + API with `env: { WC_PROVIDER: 'mock', PORT: '8787' }`); e2e uses relative `/api/worldcup` through `preview.proxy`. Execution skipped (no browsers) — gap documented. ✅
16. **No `console.log` in request paths**, no hardcoded secrets; `env.ts` still validates `process.env` via zod and fails fast. ✅

## Notable quality observations (positive)

- **`mapError` in `server/routes/worldcup.ts`** is a justified, well-documented addition over a bare
  `toApiError`: under `vite-node` a process can hold more than one module instance of `@/data/errors`,
  making `instanceof RepositoryError` identity-sensitive. The structural duck-type fallback keeps the
  upstream `code`/`httpStatus` intact instead of mis-mapping to a generic 500. This is defensive and
  correct, and it is covered by the route tests (including the cross-instance shape).
- **Test quality is strong.** The route tests assert exact envelope key sets, the 104/12 fixture shape,
  the single-flight behavior (one upstream call for two concurrent requests), 404 routing, and the full
  error-mapping matrix. The hook tests assert the `{ data, loading, error }` call-site contract, the
  relative endpoint, loading→settled transitions, the full-`Tournament`/`meta.provider` survival (M4),
  and both fail-envelope and rejected-fetch paths. These meaningfully constrain behavior, not just smoke.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW
- **L1 — `useTournamentQuery.ts:21` skips client-side re-validation (documented choice).** The fetcher
  checks only the `success` discriminant and trusts `json.data` as `Tournament` without re-running
  `parseTournament`. This is an explicit, reasonable bundle-budget tradeoff (the server already validated
  with `parseTournament`), and it is called out in the plan's Data Model section. No action required;
  noted for awareness if the API ever serves an untrusted/cross-origin source.
- **L2 — E2E not executed here.** Acceptable and pre-agreed: Playwright browsers are unavailable in this
  environment. Specs and `playwright.config.ts` are correctly rewired to the Vite preview + Hono stack
  and reference the unchanged routes. Run `npm run test:e2e` (and eyeball/regenerate visual snapshots,
  since `@fontsource` font metrics may differ from `next/font`) in an environment with browsers before
  release. No action blocking this review.

## Conclusion

The implementation satisfies the plan and every acceptance criterion. Gates pass under direct
observation: typecheck clean, 70/70 tests green, coverage well above target, `vite build` succeeds, and
the Hono API serves a byte-identical envelope at runtime. The preserved layers and the LOD work are
intact, the favicon is preserved exactly, and the library-first rewire (TanStack Query, `@fontsource`,
plain `<img>`) is correct with no duplicated concerns. No CRITICAL/HIGH/MEDIUM issues.

**VERDICT: APPROVED**
