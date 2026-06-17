# Plan Review (rev #2): Migrate Next.js → Vite + React SPA + thin Hono API

**Reviewer:** Plan Reviewer (stage 2)
**Date:** 2026-06-17
**Plan:** `docs/pipeline/migrate-to-vite-react/plan.md` (revision #2)
**Requirement:** `requirements/migrate-to-vite-react.md`
**Supersedes:** the rev #1 review previously in this file (CHANGES_REQUESTED: C1, H1, H2, M1–M5, L1, L4).

## Summary

Plan revision #2 explicitly addresses every item from the rev #1 review. I re-verified each
resolution against the actual codebase rather than trusting the plan's traceability table, and the
three blocking items are genuinely closed:

- **C1 (`vite preview` ignores `server.proxy`)** — resolved by defining one shared `proxy` constant
  assigned to **both** `server.proxy` and `preview.proxy` in `vite.config.ts`. This is the correct
  Vite behavior; the in-browser `/api/worldcup` fetch and the Playwright `request.get('/api/worldcup')`
  (which hits `baseURL` = the preview server) both depend on `preview.proxy`, and the plan now wires it.
- **H1 (server `@/` alias at runtime)** — resolved by running the API with `vite-node`, reusing Vite's
  `resolve.alias`. I confirmed the trap is real (`src/data/**` uses `@/` 24× across 9 files; `tsx` does
  not resolve tsconfig `paths`) and that `vite-node` is already present in `node_modules` transitively.
- **H2 (`env.ts` parses `process.env` at import, default `WC_PROVIDER=auto`)** — confirmed real
  (`export const env = EnvSchema.parse(process.env)` at module load; `auto` builds a `FifaRepository`).
  Resolved by (a) `test.env = { WC_PROVIDER: 'mock' }` in `vitest.config.ts`, (b) belt-and-suspenders
  `process.env.WC_PROVIDER='mock'` + dynamic import in the server test, and (c) threading
  `WC_PROVIDER=mock` into the Playwright API `webServer.env`. I also confirmed the existing data tests
  call `buildMockTournament()` directly and never touch `env`/`selectRepository`, so the process-wide
  env addition cannot perturb them (criterion #6 holds).

The MEDIUM/LOW items from rev #1 are also addressed: favicon byte-copy (M1), dropped `remotePatterns`
note (M2), per-file jsdom pragma keeping node tests on node (M3), full-`Tournament` return preserving
`meta.provider` for the Legend (M4), `queryClient` `staleTime`/`gcTime` (M5), all 15 `'use client'`
files (L1, count verified), and `concurrently` named (L4).

No CRITICAL or HIGH issues remain. The residual notes below are improvements and one requirement-
deviation flag, none of which block.

## Verification performed (rev #2 claims re-checked against code)

| Claim                                                                                                                                          | Verified | Evidence                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only `src/app/**`, `next.config.ts`, `next-env.d.ts`, `next/dynamic`, `next/font`, one `Flag.tsx` pragma, one `env.ts` import are Next-coupled | YES      | `grep next/` → `RoadmapCanvas.lazy.tsx`, `Flag.tsx` (pragma), `layout.tsx`. `process.env` only in `env.ts`.                                                      |
| 15 `'use client'` files, list correct                                                                                                          | YES      | Exactly 15; matches the plan's enumeration.                                                                                                                      |
| `useTournament` consumed only by `RoadmapCanvas.tsx` (+ itself)                                                                                | YES      | No test imports it; deletion is safe.                                                                                                                            |
| `RoadmapCanvas` destructures `{ data, loading }`, Legend reads `tournament?.meta.provider`                                                     | YES      | Lines 64, 101 — M4 return shape is required and correct.                                                                                                         |
| `getCachedTournament(repo)` accepts an injectable repo; `resetTournamentCache()` exists                                                        | YES      | Error-path test (throwing repo) is feasible; `resetTournamentCache()` between cases is genuinely required because stale-on-error would otherwise mask the throw. |
| `env.ts` parses at import; `auto` → `FifaRepository` (network)                                                                                 | YES      | H2 confirmed real.                                                                                                                                               |
| `globals.css` `@theme` tokens + `[data-lod]` rules + reduced-motion guards present; `--font-display` already falls back to `'Archivo'` literal | YES      | The move must be verbatim; the added `--font-*` vars are belt-and-suspenders (see L-A).                                                                          |
| `@vitejs/plugin-react` already a devDep; `vite`+`vite-node` resolvable; `vite` not yet a top-level dep                                         | YES      | Plan correctly adds `vite` as a dep.                                                                                                                             |
| `postcss.config.mjs` is `@tailwindcss/postcss`-only; Vite reads it                                                                             | YES      | Confirmed.                                                                                                                                                       |
| `next.config.ts` `remotePatterns` is the only allow-list; `@next/bundle-analyzer` only used by `analyze`                                       | YES      | Plan removes both correctly (M2 documented).                                                                                                                     |
| `playwright.config.ts` already `baseURL: 3217` (single Next `start` server)                                                                    | YES      | Plan rewrites `webServer` to a two-entry array (preview SPA + `vite-node` API).                                                                                  |
| `public/` does not exist; `src/app/icon.png` + `src/app/assets/favicon.ico` exist                                                              | YES      | Plan creates `public/`, byte-copies the PNG, evaluates the `.ico`.                                                                                               |

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

**M-A — `vite-node` deviates from the requirement's explicit `tsx` instruction; surface it as a
conscious deviation and keep `tsx` installed as the documented fallback.**
The requirement's Dependencies list literally says add `tsx (run the API in dev)`. The plan instead
runs the API with `vite-node` and proposes removing `tsx`. I agree `vite-node` is the better choice
(it reuses the single Vite alias source of truth; bare `tsx` would crash on the 24 `@/` imports). The
plan does justify this. The remaining gap is operational: the plan proposes _removing_ `tsx`, which
deletes the documented fallback (`tsx` + `tsconfig-paths/register`) from `node_modules` exactly when
it might be needed. Fix: keep `tsx` in `devDependencies` (it costs nothing) so the fallback is already
installed, and make sure the plan's deviation log states plainly that this overrides a literal
requirement line with owner-visible rationale.

**M-B — `server/index.ts` must read `PORT` from env; the Playwright config threads `PORT=8787` but the
plan hardcodes `port: 8787`.**
The plan's `playwright.config.ts` row sets `env: { WC_PROVIDER: 'mock', PORT: '8787' }` for the API
`webServer`, while `server/index.ts` is specified as `serve({ ..., port: 8787 })` — a literal. The
`PORT` env is silently ignored. It happens to work because both are 8787, but it is an inconsistency
and contradicts the "no hardcoded config" standard. Fix: `server/index.ts` should read
`Number(process.env.PORT) || 8787`, and the plan should assert the proxy target (`:8787`), the
Playwright `url` (`:8787/api/worldcup`), and the server port all derive from one value.

### LOW

**L-A — The added `--font-archivo`/`--font-inter` vars are belt-and-suspenders, not a fix for a real
breakage.** `global.css` already declares `--font-display: var(--font-archivo), 'Archivo', system-ui, …`
— the `'Archivo'` literal fallback resolves to the `@fontsource` family even if the vars are undefined.
Keep the explicit vars (harmless, clarifies intent), but the implementer should not treat their absence
as a font regression; the literal fallback covers it. One sentence in the plan avoids over-engineering.

**L-B — Add a non-Playwright smoke check for the `preview.proxy` path to the GREEN gate.** The C1
resolution is the single most fragile runtime assumption, and Playwright browsers cannot run in this
environment. After `vite build && vite preview` with the API up on 8787, `curl
http://localhost:3217/api/worldcup` and assert a 200 + envelope. This proves `preview.proxy` works
without depending on browsers, closing the gap the plan documents for e2e.

**L-C — Visual-baseline regeneration needs a named owner.** `@fontsource` metrics may differ from
`next/font`, tripping `toHaveScreenshot` (maxDiffPixelRatio 0.02). The plan flags this (L3) and notes
`visual.spec.ts` masks `<img>` flags. Since e2e is deferred here, explicitly assign the
regenerate-and-eyeball step to whoever runs e2e locally so an expected font shift doesn't rubber-stamp
a real regression.

## Checklist verdict

| Area            | Assessment                                                                                                                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness    | Every requirement clause covered: hard cutover, preserved domain/data/features/components incl. LOD, dev+preview proxy, Hono API reusing `selectRepository()`/`getCachedTournament()` with the same envelope, TanStack Query replacing polling, font/image swaps, favicon byte-copy, scripts, vitest/playwright rewiring, doc reconciliation. |
| Feasibility     | Code-verified; the three structural traps are real and correctly mitigated.                                                                                                                                                                                                                                                                   |
| Architecture    | Clean two-process split; one alias source of truth; call-site shape preserved so `RoadmapCanvas` blast radius is one import + one destructure.                                                                                                                                                                                                |
| Reuse           | Reuses `selectRepository`/`getCachedTournament`/`ok`/`fail`/`toApiError` verbatim; TanStack Query, Hono, `@fontsource`, `concurrently`, transitive `vite-node`. No reinvention.                                                                                                                                                               |
| Test strategy   | RED/GREEN clear; two new areas well-scoped (route incl. error path; Query hook); existing tests unchanged; ≥80% on new/changed code; error path correctly requires `resetTournamentCache()`.                                                                                                                                                  |
| Non-functionals | No secrets; `env.ts` zod-validates and fails fast; no `console.log` in request path; CORS-safe (FIFA fetch stays server-side); a11y/semantic HTML preserved; M2 future-CSP note recorded.                                                                                                                                                     |
| Risks           | Named with mitigations; residuals are deferred e2e execution (environment limit, documented) plus M-A/M-B.                                                                                                                                                                                                                                    |

## Verdict

**VERDICT: APPROVED** — no CRITICAL or HIGH issues remain. Fold M-A (record the `tsx`→`vite-node`
deviation and keep `tsx` installed as fallback) and M-B (read `PORT` from env in `server/index.ts`)
into implementation, and treat L-B as a GREEN-gate smoke check. The LOW items strengthen the plan but
do not block.
