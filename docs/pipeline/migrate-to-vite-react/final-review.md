# Final Review — Migrate Next.js → Vite + React SPA + thin Hono API

**Stage:** 7 (Final / strategic review)
**Reviewer:** Final Reviewer
**Date:** 2026-06-17
**Implementation gate (stage 6):** APPROVED
**Verdict:** **SHIP WITH CAVEATS** (caveats are environmental, not code defects — see below)

---

## What I re-ran (not taken on trust)

| Gate | Command | Observed result |
|---|---|---|
| Tests | `npm run test` | **PASS** — 9 files, **70/70 tests**, 0 failures, ~780ms |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — exit 0, no errors |
| Build | `npm run build` (`vite build`) | **PASS** — static SPA in `dist/`, built in ~561ms |
| API runtime | `vite-node server/index.ts` + `curl :8787/api/worldcup` | **PASS** — 200, `{success:true, error:null, keys:[success,data,error]}`, `matches:104`, `groups:12`, `provider:mock`, `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` |
| **preview.proxy** (C1 — the fragile assumption) | `vite preview :3217` + API :8787, `curl :3217/api/worldcup` | **PASS** — 200 + `{success:true, matches:104, groups:12}` through the proxy; `index.html` serves `rel="icon" href="/icon.png"` + `id="root"`; `/icon.png` → 200 |
| E2E | `playwright test` | **NOT RUN** — Playwright browsers unavailable here (pre-agreed gap) |

The stage-6 numbers reproduce exactly. Critically, I also ran the **`preview.proxy` smoke check** (plan-review L-B) that browsers cannot cover: `/api/worldcup` resolves through the preview server on port 3217 — the exact path the SPA and Playwright's `request` fixture use — returning a valid envelope. The single most fragile runtime assumption in this migration is therefore proven without browsers.

---

## 1. Requirement satisfaction

**Delivered in full.** This is a faithful hard cutover. Every acceptance criterion in both `requirements/migrate-to-vite-react.md` and the plan is satisfied under direct observation:

- **Next.js fully removed.** `grep next package.json` → none; no `next.config.ts` / `next-env.d.ts` / `src/app/`; `grep` for `next/*` and `server-only` imports across `src` + `server` → none. `setInterval` across `src` → none (hand-rolled polling gone).
- **Vite SPA + Hono API stood up.** `index.html` → `src/main.tsx` (`createRoot` + `QueryClientProvider`) → `src/App.tsx`; `server/index.ts` + `server/routes/worldcup.ts` on :8787.
- **Same envelope.** `GET /api/worldcup` returns the identical `ApiEnvelope<Tournament>` (`ok`/`fail`), the same `Cache-Control` header, 104 matches / 12 groups, `meta.provider`. Verified at runtime, not just in tests.
- **TanStack Query rewire.** `useTournamentQuery` uses `useQuery(['tournament'], …, { refetchInterval: 45_000 })`; preserves the `{ data, loading }` call-site so `RoadmapCanvas` blast radius is one import + one destructure; Legend still reads `tournament?.meta.provider`.
- **Preserved layers genuinely unchanged.** `git diff --stat HEAD` confirms: `src/domain/**` = 0 files changed; `src/data/**` = only `env.ts` (2 ins / 3 del — exactly the `server-only` import + its docstring); `src/features` + `src/components` = only the expected rewire (RoadmapCanvas, lazy boundary, Flag pragma, `useTournament` deletion) plus pure `'use client'` removals. The LOD work (`lod.ts`, `useZoomLevel.ts`, `[data-lod]` CSS, Group-table) is intact and its tests pass.
- **Favicon preserved byte-for-byte.** `public/icon.png` and `dist/icon.png` both SHA1 `f39a163c…`, matching `git HEAD:src/app/icon.png` exactly (2830 bytes). Referenced from `index.html`, served at 200.

**Partial / deferred — be honest:**
- **E2E was not executed** (no Playwright browsers in this environment). Specs and `playwright.config.ts` are correctly rewired (baseURL :3217, two-entry `webServer` array, API `env: { WC_PROVIDER: 'mock', PORT: '8787' }`, specs hit unchanged routes `/api/worldcup` and `/?view=bracket`). This is a real, documented gap — the e2e suite has **not been observed green on this stack**, only made structurally correct. Must run before release.
- **Visual snapshots may be stale.** Baselines were captured under `next/font`; `@fontsource` metrics can differ. No regeneration has happened. This rides on the e2e gap.

No gate was silently skipped and no test is weak by omission. The one true gap (e2e execution) is environmental and flagged in every prior stage.

## 2. Tradeoffs

- **`vite-node` to run the API, not `tsx`.** The requirement literally lists `tsx`. The team chose `vite-node` because the server imports `src/data/**`, which uses the `@/` alias 24× across 9 files; bare `tsx` does not resolve tsconfig `paths` and would crash on boot. `vite-node` reuses Vite's single `resolve.alias` — one alias source of truth, zero `tsconfig-paths` shimming, no new top-level dependency. This is the **right call** and was correctly surfaced as a conscious deviation. **However:** the plan-review's M-A advice was to *keep `tsx` installed as the documented fallback*; the implementation **removed `tsx` entirely** (`grep tsx package.json` → absent). So the documented escape hatch (`tsx` + `tsconfig-paths/register`) is not pre-installed. Low impact (re-adding it is one `npm i -D` away), but it diverges from the reviewed plan — noted as a follow-up, not a blocker.
- **Client skips re-validation.** `fetchTournament` checks only the envelope `success` discriminant and trusts `json.data` as `Tournament` rather than re-running `parseTournament`. Optimized for bundle budget; the server already validates. Right call for a same-origin first-party API — but it means the client trusts the server boundary completely (acceptable here; revisit if the API ever fronts an untrusted source).
- **Two deploy artifacts instead of one.** The cutover trades Next's single-artifact deploy (and SSR/SEO/RSC, `next/image`/`next/font` conveniences) for a static SPA + a Node API process. Correct and intended: the FIFA endpoint is CORS-blocked and needs a server-set `User-Agent`, so a pure SPA was never viable for live data. The "zero backend" fallback was correctly rejected.
- **`mapError` duck-type fallback over bare `toApiError`.** Added because `vite-node` can hold more than one module instance of `@/data/errors`, making `instanceof RepositoryError` identity-sensitive and prone to mis-mapping a domain error to a generic 500. A small, well-documented, well-tested defensive addition. Good engineering; it is a direct consequence of the `vite-node` choice and slightly increases the route's surface area.

## 3. Architecture & fit

Strong fit. The two-process split (static SPA + thin Node API) is the conventional Vite-era shape and aligns with the library-first stack policy (framework row now "Vite + React SPA + Hono API"). Key fit signals:

- **Minimal blast radius.** The framework swap touched exactly the framework-coupled surface and nothing else. Domain and data layers are byte-identical save one import line. This is the cleanest possible expression of "migration, not rewrite."
- **One alias source of truth.** `vite.config.ts` `resolve.alias` is reused by the SPA, Vitest, and the API runner (`vite-node`) — no parallel path config to drift.
- **Proxy correctness designed in, not bolted on.** A single `proxy` constant feeds both `server.proxy` and `preview.proxy`, structurally closing the `vite preview` proxy trap rather than relying on procedure.
- **Library-first honored, no duplicated concerns.** TanStack Query replaces hand-rolled polling; `@fontsource` replaces `next/font`; plain `<img>` replaces `next/image`; `concurrently` runs the two dev processes. No second library for any covered concern.

The result introduces no friction with the codebase's direction; it *is* the foundation later phases (libraries + layout overhaul) build on.

## 4. Tech debt & risks

- **E2E unproven on the new stack (highest residual risk).** Config and specs are correct, but the suite has not been observed green. The `preview.proxy` smoke check de-risks the proxy path; node placement, keyboard/zoom flows, a11y, and visual diffs remain unverified end-to-end.
- **Visual baselines likely stale** under `@fontsource`. Regenerate-and-eyeball is owed; blindly accepting `--update-snapshots` could rubber-stamp a real regression.
- **`tsx` fallback not installed** (diverges from reviewed plan M-A). If `vite-node` ever proves unsuitable in a deploy target, the documented fallback is not pre-staged.
- **Client trusts the server envelope** (no client-side `parseTournament`). Fine same-origin; a latent assumption if the API surface changes.
- **Security posture (system level):** no hardcoded secrets; `env.ts` zod-validates `process.env` and fails fast; no `console.log` in request paths; FIFA fetch stays server-side (CORS-safe). **Note for later:** no CSP/security headers are set on the Hono responses, and a future CSP must allow `https://api.fifa.com` + `https://digitalhub.fifa.com` in `img-src` for flags. Out of scope for this migration but worth tracking. No rate limiting on the API yet (the TTL cache + single-flight absorbs polling load, which mitigates but does not equal rate limiting).
- **Performance posture:** initial JS 226.87 kB raw / **71.04 kB gz**, under the 150 kB landing budget; React Flow (212 kB / 69.48 kB gz) stays lazy-split behind `React.lazy`. `@fontsource` ships only the imported weights. Healthy.

No CRITICAL or HIGH debt. The debt is one config divergence (`tsx`) plus deferred verification (e2e/visual), not structural shortcuts.

## 5. Test & quality posture

**Confidence: high for the unit/integration surface, medium for end-to-end.**

- **Strong:** Domain + data + features tests (lod, mapper, standings, build-bracket, bracket-layout, build-mock-tournament, build-graph) pass **unchanged** — the framework-agnostic acceptance criterion holds. The two new areas are well-constructed, not smoke: the route test asserts exact envelope key sets, the 104/12 fixture, single-flight (one upstream call for two concurrent requests), 404 routing, and the full error-mapping matrix incl. the cross-module-instance shape; the hook test asserts the `{ data, loading, error }` contract, the relative endpoint, loading→settled transitions, `meta.provider` survival, and both fail-envelope and rejected-fetch paths. New modules at **100%** coverage; overall **92.81% stmts / 87.86% branch** (stage-6 figure, consistent with the 70-test green run observed here).
- **Thin:** No automated coverage of the running SPA shell (App render, lazy boundary, font load) — that is the e2e/visual layer, which has not executed. The dev `concurrently` orchestration and the FIFA live path (`WC_PROVIDER=auto/fifa`) are exercised only manually/by inspection, not in CI.

## 6. Follow-ups (prioritized)

**Must-do before release:**
1. **Run `npm run test:e2e` in an environment with Playwright browsers.** This is the one unobserved gate. Confirm roadmap render, stage toggle, detail panel, wheel-zoom, and a11y pass on the Vite preview + Hono stack.
2. **Regenerate and eyeball visual snapshots** (`npm run test:e2e:update`), since `@fontsource` metrics may differ from `next/font`. Inspect diffs so an expected font shift does not mask a real regression.

**Nice-to-have:**
3. **Re-add `tsx` to `devDependencies`** as the documented `vite-node` fallback (closes the plan-review M-A divergence; costs nothing).
4. **Track a future security-headers/CSP task** for the Hono API responses (allow the two FIFA hosts in `img-src`); add light rate limiting if the API is ever exposed beyond the proxy.
5. **Optional:** consider re-running `parseTournament` client-side only if the API ever fronts a non-first-party source.

---

## Verdict

**SHIP WITH CAVEATS.**

The migration is complete, faithful, and green under direct observation: 70/70 tests, clean typecheck, successful `vite build`, a byte-identical API envelope at runtime, and a passing `preview.proxy` smoke check that de-risks the one fragile runtime assumption browsers couldn't cover. Next.js is gone with no remnants; the preserved domain/data/features/components layers (including the LOD work) are genuinely untouched; the favicon is preserved byte-for-byte. Code quality and test quality are high with no CRITICAL/HIGH/MEDIUM issues.

**Caveats (none are code defects):**
- **E2E has not been executed** on this stack (no browsers here). Config + specs are correct but unobserved — run before release.
- **Visual baselines are likely stale** under `@fontsource` — regenerate and eyeball.
- **`tsx` fallback was removed** rather than kept per plan-review M-A — re-add as a cheap safety net.

Clear those three (the first two are gating for release; the third is hygiene) and this ships clean.
