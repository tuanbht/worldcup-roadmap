# Plan: Migrate Next.js → Vite + React SPA + thin Hono API (hard cutover)

> Revision #2 — addresses every item in `plan-review.md` (C1, H1, H2, M1–M5, L1, L4).
> Decisions previously left open are now resolved inline; see the **Resolved review items** map at the end.

## Scope

### In scope
- Remove Next.js entirely (deps, config, `src/app/**`, framework-coupled imports) in a single hard-cutover pass.
- Stand up a Vite + React SPA (`index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`) with a `/api` dev **and** preview proxy.
- Stand up a thin Hono Node API (`server/`) on port 8787 exposing `GET /api/worldcup`, reusing `selectRepository()` + `getCachedTournament()` and returning the **same** `ApiEnvelope<Tournament>`.
- Rewire client data fetching from the hand-rolled `useTournament` (fetch + `setInterval` + `AbortController`) to TanStack Query `useQuery`.
- Replace `next/font` → `@fontsource/archivo` + `@fontsource/inter`; replace `next/dynamic` lazy boundary → `React.lazy` + `<Suspense>`; remove the `next/image` eslint pragma in `Flag.tsx` (already a plain `<img>`).
- Drop `import 'server-only'` from `env.ts`, keep the zod `process.env` validation.
- Preserve the Next `app/icon.png` as the SPA favicon under `public/` via a **byte-for-byte filesystem copy**.
- Wire Tailwind v4 via PostCSS so `global.css` (`@import 'tailwindcss'` + `@theme` tokens + `[data-lod]` LOD rules) works under Vite.
- Update `package.json` scripts (`dev:web`, `dev:api`, `dev`, `build`, `preview`, `start:api`), `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`.
- Add two genuinely-new test areas: the Hono `worldcup` route handler and the TanStack Query tournament hook.
- Update e2e specs/config to the new dev/preview stack and document that browsers cannot run here.

### Out of scope (do NOT touch)
- **All of `src/domain/**`** — types, bracket, standings, seeding, build-bracket, assemble-tournament (framework-agnostic).
- **All of `src/data/**`** — FIFA + mock providers, `repository.ts`, `repository-factory.ts`, `cache/tournament-cache.ts`, `envelope.ts`, `errors.ts`, `schema/**` (only the **removed** consumer is the Next route; `env.ts` loses exactly one import line, nothing else).
- **All of `src/features/**`** including the LOD work (`lod.ts`, `hooks/useZoomLevel.ts`, data-lod wiring), `graph-model.ts`, `layout/**`, `build-graph.ts`.
- **All of `src/components/**`** rendering logic (React Flow roadmap UI, Group-table fix). Only the `'use client'` directives are now inert; remove them but do **not** change component behavior.
- Existing **domain + data + features unit tests** — must pass UNCHANGED (acceptance criterion). If an import path breaks, fix the **import only**.
- The deterministic mock simulator, PRNG, FIFA `User-Agent`/pagination logic (still runs server-side in Hono).
- No new layout overhaul, no new libraries beyond those listed (that is a later phase).

## Approach

Treat this as a **mechanical move + rewire**, not a rewrite. The only Next-coupled code is `src/app/**` and one import in `env.ts`; everything else is framework-agnostic TypeScript that carries over byte-for-byte. We add a Vite entry that mounts `App.tsx` (the old `page.tsx` body) inside `<QueryClientProvider>`, and a ~30-line Hono server that wraps the exact same `selectRepository()` + `getCachedTournament()` + `ok/fail` envelope the Next route used — so live FIFA data keeps flowing server-side (CORS-safe). In dev, Vite proxies `/api` → `http://localhost:8787` so the SPA and API run as two processes under one `npm run dev`. TanStack Query replaces the bespoke polling, closing the library-first gap while keeping the `{ data, loading }` call-site shape `RoadmapCanvas` already destructures (the full `Tournament`, including `meta.provider`, still flows — see Data Model and M4).

**RESOLVED — server `@/` alias runner (was H1, was an open question):** `src/data/**` imports each other via `@/` (verified: **24 occurrences across 9 files**, e.g. `@/data/config/env`, `@/domain/types`, `@/data/repository`). The Hono server imports `src/data` + `src/domain`, so the **server runtime must resolve `@/* → ./src/*`**. `tsx` does **not** resolve tsconfig `paths` by default, which would break startup. **Decision: run the API with `vite-node`** — `vite-node server/index.ts` for `start:api`, `vite-node --watch server/index.ts` for `dev:api`. `vite-node` reuses Vite's `resolve.alias` (already defined for the SPA/Vitest), giving **one alias source of truth and zero `tsconfig-paths` shimming**. `vite-node` ships transitively with `vite`/`vitest` (both are deps), so this adds **no new top-level dependency** — it is a *justified deviation* from the requirement's literal `tsx` mention (the requirement says "tsx (run the API in dev)"; `vite-node` serves the same role with strictly less config). `tsx` stays in devDependencies only if some other script needs it; otherwise it may be removed. The server typecheck (`tsc --noEmit`) resolves `@/` via the root `tsconfig.json` `paths`, which is unchanged.

**RESOLVED — `vite preview` proxy gotcha (was C1):** the SPA fetches a **relative** `/api/worldcup`, and the e2e `request` fixture also hits relative `/api/worldcup` against `baseURL`. **`vite preview` does NOT honor `server.proxy`; it uses a separate `preview.proxy` key.** Both `server.proxy` and `preview.proxy` will be defined in `vite.config.ts` from a single shared `proxy` constant, so both `npm run dev` and `vite preview` (and therefore Playwright) proxy `/api` → `:8787`. Without `preview.proxy` every in-browser `/api/worldcup` call and every `request.get('/api/worldcup')` would 404, failing acceptance #7 and all e2e specs.

**RESOLVED — env parsed at import time (was H2):** `src/data/config/env.ts` runs `export const env = EnvSchema.parse(process.env)` **at module-import time**, with `WC_PROVIDER` defaulting to `auto` (which builds a `FifaRepository` and would attempt a real network call). `selectRepository()` and the FIFA client read `env.*`. The existing data unit tests never touch this path (they call `buildMockTournament()` directly — verified), so the new `server/routes/worldcup.test.ts` is the **first** test to exercise `env`. It must pin `WC_PROVIDER=mock` **before** any data-layer import. Mechanism: set it via Vitest `test.env` in `vitest.config.ts` (`env: { WC_PROVIDER: 'mock' }`) so it is in `process.env` before any module loads — this is process-wide for the run but safe because (a) domain/data tests don't read it and (b) it gives the server test deterministic mock data. As belt-and-suspenders, the server test ALSO sets `process.env.WC_PROVIDER = 'mock'` at the top and then **dynamic-imports** the route module, so import order can never capture `auto`. The existing data tests need no change. Playwright's `webServer` threads `WC_PROVIDER=mock` into the **API process** (not just the build) — see the `playwright.config.ts` row.

**Rejected alternative:** the requirement's "ZERO backend / bundle `tournament.json`" fallback. Rejected because it permanently kills live FIFA data — the FIFA endpoint is CORS-blocked from browsers and needs the bot-evading `User-Agent` header that cannot be set client-side, and one shared TTL cache must absorb all polling. The thin Hono server preserves all of that for ~30 lines of new code.

## Files

### Create

| Path | Action | Responsibility |
|---|---|---|
| `index.html` | create | Vite HTML entry. `<html lang="en">` carrying the `--font-archivo`/`--font-inter` consumption (see global.css note), `<meta name="theme-color" content="#0a0e14">`, `<meta name="viewport" content="width=device-width, initial-scale=1">` (was Next `viewport` export), `<title>World Cup 2026 — Roadmap</title>`, `<meta name="description" …>` (was Next `metadata`), `<link rel="icon" href="/icon.png">`, `<div id="root"></div>`, `<script type="module" src="/src/main.tsx"></script>`. Semantic, no wrapper-div stacks. |
| `vite.config.ts` | create | `@vitejs/plugin-react`; `resolve.alias['@'] = path.resolve(__dirname, './src')`; a single `const proxy = { '/api': { target: 'http://localhost:8787', changeOrigin: true } }` assigned to **BOTH** `server.proxy` AND `preview.proxy` (C1 — `vite preview` ignores `server.proxy`); `server.port = 3217` and `preview.port = 3217` (match the e2e baseURL to minimize churn). Vite reads `postcss.config.mjs` automatically for Tailwind. |
| `src/main.tsx` | create | `ReactDOM.createRoot(document.getElementById('root')!)` → `<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>`. Side-effect imports: `./styles/global.css`, `@fontsource/archivo/600.css` + `/700.css` + `/800.css`, `@fontsource/inter/400.css` + `/500.css` + `/600.css` + `/700.css`. (`@xyflow/react/dist/style.css` stays imported inside `RoadmapCanvas` — leave it.) |
| `src/App.tsx` | create | The old `app/page.tsx` body verbatim: `<main className="flex h-dvh flex-col overflow-hidden">` + `<header>` hero (same copy/classes, including the `kbd` "F" hint) + `<section aria-label="World Cup roadmap">` rendering `RoadmapCanvasLazy`. No data fetching here. |
| `src/lib/queryClient.ts` | create | Singleton `QueryClient` with explicit defaults (M5): `defaultOptions.queries = { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 }`. `staleTime > 0` + `gcTime` ensure the 45s `refetchInterval` plus StrictMode double-mount **dedupe in-flight requests** and avoid redundant churn. Pure config; only side effect is constructing the client. |
| `src/features/roadmap/hooks/useTournamentQuery.ts` | create | Replaces `useTournament`. `useQuery({ queryKey: ['tournament'], queryFn: fetchTournament, refetchInterval: 45_000 })` hitting `/api/worldcup`. `fetchTournament` parses `ApiEnvelope<Tournament>`, throws `error.message` on `success: false`. Returns the **full `Tournament`** as `data` (so `tournament.meta.provider` survives for the Legend — M4) plus `loading` mapped from `isPending`, and `error` (string\|null). Shape: `{ data: Tournament \| null, loading: boolean, error: string \| null }`. |
| `server/index.ts` | create | `@hono/node-server` `serve({ fetch: app.fetch, port: 8787 })`. Mounts the worldcup route. Reads `process.env` (no secrets hardcoded). A single boot line is acceptable; **no `console.log` in the request path**. Process entry only — keep handler logic in `routes/`. |
| `server/routes/worldcup.ts` | create | Hono app/handler for `GET /api/worldcup`. ~15 lines: `try { const repo = selectRepository(); const t = await getCachedTournament(repo); return c.json(ok(t), 200, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }); } catch (err) { const e = toApiError(err); return c.json(fail(e.code, e.message), e.http); }`. Same envelope + headers as the deleted Next route. Exported as a `Hono` instance so the test can call `app.request(...)`. |
| `server/routes/worldcup.test.ts` | create | Vitest (node env). At top: `process.env.WC_PROVIDER = 'mock'` then `const { worldcup } = await import('./worldcup')` (dynamic import so env is set first — H2). Assert `app.request('/api/worldcup')` → `200`, `body.success === true`, `body.data.matches.length === 104`, `body.data.groups.length === 12`, envelope shape `{ success, data, error }`. Error path: inject a throwing repo (or stub `getCachedTournament` to reject with a `RepositoryError`) → assert `fail` envelope `{ success: false, data: null, error: { code, message } }` and the `toApiError` HTTP status (e.g. 502/429/500). Reset the cache singleton (`resetTournamentCache`) between cases. |
| `src/features/roadmap/hooks/useTournamentQuery.test.tsx` | create | `// @vitest-environment jsdom` pragma (M3). Vitest + `@testing-library/react` `renderHook` wrapped in a fresh `QueryClientProvider` (new `QueryClient` per test, `retry: false`). Mock `globalThis.fetch`: success → `ok(stubTournament)` envelope ⇒ assert `loading` flips false and `data.meta.provider === 'mock'` (M4 — full Tournament returned). Failure → `fail('X','msg')` envelope ⇒ assert `error === 'msg'`, `data === null`. Assert the hook's returned object exposes `{ data, loading, error }`. No real network. |
| `public/icon.png` | create (binary copy) | The preserved favicon. **Created by a filesystem copy** of `src/app/icon.png` (`cp`/`fs.copyFileSync`), NOT a Write/text round-trip (would corrupt the PNG — M1). `public/` does not exist yet → create it first. Referenced by `index.html` `<link rel="icon">`. |
| `src/styles/global.css` | create (move) | Byte-for-byte the old `app/globals.css`: `@import 'tailwindcss'`, the `@theme` oklch/hex tokens, `livepulse`/`edgeflow` keyframes, `@layer base/components`, `.pitch-grid`, `[data-lod]` LOD opacity rules, React Flow chrome theming, `@media (prefers-reduced-motion)` guards. **Plus** add `--font-archivo: 'Archivo'` and `--font-inter: 'Inter'` to the existing `@layer base :root` block so the `@theme` `--font-display: var(--font-archivo)…` references resolve to the `@fontsource` families (next/font previously injected these vars). **Do not edit the LOD CSS.** |
| `src/vite-env.d.ts` | create | `/// <reference types="vite/client" />` so Vite client types (e.g. `import.meta.env`) typecheck. Create only if not already present. |

### Modify

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | modify | **Add deps:** `vite`, `@tanstack/react-query`, `hono`, `@hono/node-server`, `@fontsource/archivo`, `@fontsource/inter`. **Add devDeps:** `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `concurrently` (L4 — the maintained multi-process runner, per library-first policy). `@vitejs/plugin-react` already present (keep). `vite-node` is provided transitively by `vite`/`vitest` (no explicit add needed, but may be added explicitly for clarity). **Remove:** `next`, `eslint-config-next`, `server-only`, `@next/bundle-analyzer`. `tsx` is no longer required by any script (the API uses `vite-node`); remove it unless a future script needs it. **Scripts:** `dev:web: vite`, `dev:api: WC_PROVIDER may be unset for real data; vite-node --watch server/index.ts`, `dev: concurrently -k -n web,api "npm:dev:web" "npm:dev:api"`, `build: vite build`, `preview: vite preview`, `start:api: vite-node server/index.ts`, keep `typecheck`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `test:e2e:update`. **Remove** `lint` (no ESLint config remains) and `analyze`. |
| `tsconfig.json` | modify | Remove `plugins: [{ name: 'next' }]`; remove `"next-env.d.ts"` and `".next/types/**/*.ts"` from `include`. Set `jsx: 'react-jsx'` (was `preserve`). Keep `paths['@/*'] = ['./src/*']` (server typecheck relies on it). Set `include` to cover `src/**`, `server/**`, `e2e/**`, `vite.config.ts`, `vitest.config.ts`, `src/vite-env.d.ts` (criterion #5). `incremental: true` is now optional without Next — keep (harmless) or drop; if dropped, no `.tsbuildinfo` is written. Add `vite/client` to ambient types via `src/vite-env.d.ts` rather than `compilerOptions.types`. |
| `src/data/config/env.ts` | modify | Delete the single line `import 'server-only';` and trim the doc sentence about "server-only makes client import a build error". Keep the entire zod `EnvSchema.parse(process.env)` unchanged. **This is the ONLY edit to `src/data/**`.** |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Change the import `useTournament` → `useTournamentQuery`; call `const { data: tournament, loading } = useTournamentQuery();`. Legend still reads `tournament?.meta.provider ?? null` — unchanged (M4). Remove the inert `'use client';`. **No other behavioral change** — all React Flow props, Legend, LOD `data-lod`, loading overlay preserved. |
| `src/components/roadmap/RoadmapCanvas.lazy.tsx` | modify | Replace `next/dynamic` with `const RoadmapCanvas = React.lazy(() => import('./RoadmapCanvas'))` and wrap in `<Suspense fallback={…}>` reproducing the exact "Preparing the bracket…" markup/classes. Remove `'use client';`. (Behaviorally equivalent to the old `ssr:false` dynamic since there is no SSR now.) |
| `src/components/ui/Flag.tsx` | modify | Remove the `// eslint-disable-next-line @next/next/no-img-element` comment. Remove `'use client';`. The `<img loading="lazy" width height onError>` with monogram fallback is already correct — keep. (M2: the flag URLs now load directly from FIFA hosts in the browser — confirmed fine for a plain `<img>`; see Risks.) |
| `src/features/roadmap/hooks/useStageView.ts` | modify | Keep `window.history.replaceState` (works in SPA). Remove `'use client';`. The `typeof window === 'undefined'` SSR guard is now always false but harmless — leave to avoid churn. No behavioral change. |
| Remaining `'use client'` files (15 total, L1) | modify (mechanical) | Remove the now-inert `'use client';` directive from **all 15** files: `MatchDetailPanel.tsx`, `GroupTableNode.tsx`, `MatchNode.tsx`, `RoadmapCanvas.tsx`, `useZoomLevel.ts`, `RoadmapCanvas.lazy.tsx`, `SegmentedControl.tsx`, `Flag.tsx`, `useBracketKeyboard.ts`, `useFitOnChange.ts`, `useRoadmapGraph.ts`, `useStageView.ts`, `useTournament.ts` (this file is **deleted**, see below), `StageToggle.tsx`, `AdvanceEdge.tsx`. Pure deletion, zero behavioral change; must not alter any other line. |
| `vitest.config.ts` | modify | Add `@vitejs/plugin-react` to `plugins` (for the `.tsx` hook test). Add `test.env = { WC_PROVIDER: 'mock' }` (H2 — set before any module import). Keep global `test.environment: 'node'`; the **only** jsdom test is the hook test, which opts in via its `// @vitest-environment jsdom` pragma (M3 — domain/data tests STAY on node; the React plugin does not change how `.test.ts` transpile). Add `test.setupFiles = ['./vitest.setup.ts']` only if the hook test needs `@testing-library/jest-dom` matchers; scope it so it is harmless under node (the import is side-effect-only and safe), OR import `@testing-library/jest-dom` directly in the `.tsx` test to keep setup jsdom-scoped (preferred — no global setup needed). Update `include` to add `server/**/*.test.ts` and `src/**/*.test.tsx`. Update `coverage.include`: add `server/routes/**`, `src/features/roadmap/hooks/useTournamentQuery.ts`. Keep `resolve.alias['@']`. |
| `vitest.setup.ts` | create (only if global setup chosen) | If the hook test uses global setup: `import '@testing-library/jest-dom';`. Preferred alternative is a per-test import in the `.tsx` file, in which case this file is NOT created (M3 — keep jsdom matchers out of node-env tests). |
| `playwright.config.ts` | modify | `baseURL` → `http://localhost:3217` (the Vite preview port). `webServer` becomes an **array** of two entries: (1) build+serve the SPA — `command: 'npm run build && npm run preview'`, `url: 'http://localhost:3217'`; (2) the API — `command: 'vite-node server/index.ts'`, `url: 'http://localhost:8787/api/worldcup'`, **`env: { WC_PROVIDER: 'mock', PORT: '8787' }`** so the API serves deterministic mock data (H2 — threaded into the API process, not just the build). The in-browser `/api/worldcup` calls reach the API via `preview.proxy` (C1). Both entries `reuseExistingServer: !process.env.CI`, `timeout: 120_000`. Keep the existing `chromium`+`mobile` projects. |
| `requirements/library-first-stack-policy.md` | modify (doc) | The framework row is already marked superseded. Update the **Fonts** row (`next/font` → `@fontsource/archivo` + `@fontsource/inter`), **Images** row (`next/image` → plain `<img>`; note the dropped `remotePatterns` allow-list — M2), and **Lint** row (`eslint-config-next` removed; no ESLint config remains). Low-risk doc reconciliation. |

### Delete

| Path | Action | Responsibility |
|---|---|---|
| `src/app/layout.tsx` | delete | Replaced by `index.html` + `src/main.tsx`. |
| `src/app/page.tsx` | delete | Replaced by `src/App.tsx`. |
| `src/app/globals.css` | delete | Moved to `src/styles/global.css` (verbatim + the two `--font-*` vars). |
| `src/app/api/worldcup/route.ts` | delete | Replaced by `server/routes/worldcup.ts`. |
| `src/app/icon.png` | delete (after verified copy) | Copied byte-for-byte to `public/icon.png` first; delete only after a hash/size check confirms the copy (M1). |
| `src/app/assets/favicon.ico` | evaluate | If referenced anywhere, copy to `public/` too; otherwise it is unused and removed with `src/app/`. Confirm during implementation. |
| `src/features/roadmap/hooks/useTournament.ts` | delete | Replaced by `useTournamentQuery.ts`. Removes the only `setInterval`/`AbortController` polling (criterion #8). |
| `next.config.ts` | delete | No Next. (M2: this also drops the `images.remotePatterns` FIFA-host allow-list — acceptable for plain `<img>`; see Risks.) |
| `next-env.d.ts` | delete | No Next. |
| `postcss.config.mjs` | **keep** | Already `@tailwindcss/postcss` only — Vite reads it as-is. Listed to be explicit: do **not** delete. |

## Data Model / Types

No domain/data types change. Reused unchanged:
- `ApiEnvelope<T>` (`src/data/envelope.ts`) — the server route returns this exact discriminated union; `ok()`/`fail()` unchanged.
- `Tournament` (`src/domain/types`) — payload shape; the client fetcher and Query hook are typed against it. **`Tournament.meta.provider`** (`ProviderName`) is the field the Legend renders (`tournament?.meta.provider`) — the new hook returns the full `Tournament`, so it survives (M4).
- `MatchRepository`, `selectRepository()`, `getCachedTournament()`, `resetTournamentCache()`, `toApiError()` — reused verbatim by the Hono route and its test.
- `Env` / `EnvSchema` (`src/data/config/env.ts`) — unchanged zod schema; only the `server-only` import is deleted.

New code (small, at boundaries):
```ts
// src/features/roadmap/hooks/useTournamentQuery.ts
import type { Tournament } from '@/domain/types';
import type { ApiEnvelope } from '@/data/envelope';

async function fetchTournament(): Promise<Tournament> {
  const res = await fetch('/api/worldcup', { cache: 'no-store' });
  const json = (await res.json()) as ApiEnvelope<Tournament>;
  if (!json.success) throw new Error(json.error.message);
  return json.data; // full Tournament incl. meta.provider (M4)
}

interface TournamentQueryResult {
  data: Tournament | null;
  loading: boolean;
  error: string | null;
}
```
The fetcher validates the boundary by checking the `success` discriminant and throwing on failure. The server already validated with `parseTournament`; re-parsing client-side is optional defense-in-depth but is skipped to respect the bundle budget — documented choice.

```ts
// server/routes/worldcup.ts — Hono
import { Hono } from 'hono';
import { selectRepository } from '@/data/repository-factory';
import { getCachedTournament } from '@/data/cache/tournament-cache';
import { fail, ok } from '@/data/envelope';
import { toApiError } from '@/data/errors';

export const worldcup = new Hono().get('/api/worldcup', async (c) => {
  try {
    const repo = selectRepository();
    const t = await getCachedTournament(repo);
    return c.json(ok(t), 200, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' });
  } catch (err) {
    const e = toApiError(err);
    return c.json(fail(e.code, e.message), e.http as 429 | 500 | 502);
  }
});
```

```ts
// src/lib/queryClient.ts (M5)
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});
```

## Test Strategy

### Behaviors to test

**Unchanged (must pass without edits — fix import paths only if they break — criterion #6):**
1. `src/domain/bracket/build-bracket.test.ts`, `standings.test.ts` — bracket topology + standings.
2. `src/data/providers/mock/build-mock-tournament.test.ts` — deterministic 104 matches / 12 groups (calls `buildMockTournament()` directly; never touches `env`/`selectRepository` — so unaffected by the `WC_PROVIDER` change).
3. `src/data/providers/fifa/mapper.test.ts` — FIFA payload mapping.
4. Any `src/features/roadmap/**` layout/LOD/build-graph tests present — layout + LOD.

These run on the **node** environment unchanged; adding `@vitejs/plugin-react` and the per-file jsdom pragma must not alter their transpile or environment (M3).

**New — unit/integration:**
5. **Hono worldcup route** (`server/routes/worldcup.test.ts`): with `WC_PROVIDER=mock` pinned **before import** (H2 — `process.env` set then dynamic-import; backed by `test.env` in vitest.config), `app.request('/api/worldcup')` → `200` + `ApiEnvelope` with `success: true`, `data.matches.length === 104`, `data.groups.length === 12`; same envelope shape as the old route. Error path (inject throwing repo) → `fail` envelope with `toApiError`-mapped code/status. `resetTournamentCache()` between cases.
6. **TanStack Query hook** (`useTournamentQuery.test.tsx`, jsdom pragma): success envelope → `{ data: <full tournament incl. meta.provider>, loading: false }`; failure envelope → `error` surfaced, `data` null; assert the returned object preserves the `{ data, loading, error }` shape `RoadmapCanvas` destructures (M4). `refetchInterval` is config (asserted as an option; no real timer wait).

**E2E (specs updated; browsers may not run here — documented gap):**
7. `e2e/roadmap.spec.ts` — `request.get('/api/worldcup')` returns normalized tournament (104/12) **through the preview proxy** (C1); hero heading + React Flow node render; stage toggle + detail panel. Routes are unchanged (`/api/worldcup`, `/?view=bracket`); only `playwright.config.ts` wiring changes.
8. `e2e/wheel-zoom.spec.ts`, `e2e/visual.spec.ts`, `e2e/a11y.spec.ts` — assertions unchanged; only `webServer`/`baseURL` wiring changes. **Visual snapshots may need regeneration** if `@fontsource` metrics differ from `next/font` — make this an explicit, owned `test:e2e:update` step and **eyeball** regenerated baselines so a real regression isn't masked (L3). Note `visual.spec.ts` already masks flag `<img>`s, so remote-flag flakiness is contained.

### Acceptance criteria (testable) → numbered list below.

### Coverage target
≥80% statements/branches on the new + changed code (`server/routes/**`, `useTournamentQuery.ts`). Existing domain/data coverage preserved by the unchanged tests. Add `server/routes/**` and the new hook to `vitest.config.ts` `coverage.include`. Verify with `npm run test:coverage`.

## Risks & Open Questions

### Risks (with mitigations)
- **Server `@/` alias at runtime (was the top risk — now RESOLVED via `vite-node`):** running `vite-node server/index.ts` reuses Vite's `resolve.alias`, so the 24 `@/` imports across 9 data files resolve with zero extra config. If `vite-node` ever proves unsuitable, the documented fallback is `tsx` + `tsconfig-paths/register` (`node --import tsconfig-paths/register` style), which would require adding `tsconfig-paths` as a dep — not the chosen path.
- **`vite preview` proxy (RESOLVED — C1):** both `server.proxy` and `preview.proxy` are defined from one shared object. Mitigation is structural, not procedural.
- **Env parsed at import (RESOLVED — H2):** `WC_PROVIDER=mock` is set in both `vitest.config.ts` `test.env` and at the top of the server test before a dynamic import; Playwright threads `WC_PROVIDER=mock` into the API `webServer.env`.
- **Tailwind v4 under Vite:** repo uses `@tailwindcss/postcss` (not `@tailwindcss/vite`). Vite auto-reads `postcss.config.mjs`, so `@import 'tailwindcss'` + `@theme` should compile to utilities (`bg-bg`, `font-display`, `animate-livepulse`). If the PostCSS path misbehaves, switch to `@tailwindcss/vite`. Verify utilities render after `vite build`.
- **Font variables:** `@fontsource` ships `font-family: 'Archivo'`/`'Inter'`, not the `--font-archivo`/`--font-inter` CSS vars `next/font` injected. The `@theme` block references those vars, so `global.css` must define `--font-archivo: 'Archivo'` / `--font-inter: 'Inter'` (added to `:root`); otherwise fonts silently fall back to `system-ui` (criterion #12).
- **Dropped `next/image` `remotePatterns` (M2):** deleting `next.config.ts` removes the FIFA-host (`api.fifa.com`, `digitalhub.fifa.com`) allow-list that was for `next/image` optimization. `Flag.tsx` is already a plain `<img>` with an `onError` monogram fallback, so flag URLs load directly in the browser — functionally fine, no allow-list needed. **Note for the future:** if a CSP is later added, its `img-src` must allow `https://api.fifa.com` and `https://digitalhub.fifa.com` (and `data:` for the monogram is not needed since the fallback is a styled `<span>`). Documented so flags don't silently break under a future CSP.
- **Visual regression baselines:** captured under `next/font`; `@fontsource` metrics may shift hinting → may need `--update-snapshots`. Treat as expected, eyeball, don't blindly accept (L3).
- **StrictMode + `refetchInterval` (M5):** `staleTime: 30_000` + `gcTime` on the singleton `QueryClient` dedupe the StrictMode double-mount and the 45s refetch so dev doesn't churn redundant requests; the server's single-flight TTL cache is a second line of defense.
- **Bundle budget:** landing JS < 150kb gz. React + React Flow + TanStack Query + `@fontsource` CSS — React Flow is the heavy item and stays lazy-loaded behind `React.lazy`. Verify `vite build` output sizes; `@fontsource` adds CSS + woff2 (only the imported weights).

### Open questions
- **None blocking.** Port is fixed at `3217` (matches the existing e2e config). The API runner is decided (`vite-node`). The multi-process runner is decided (`concurrently`). The jsdom strategy is decided (per-file pragma + per-test `@testing-library/jest-dom` import, no global node-env setup). One low-stakes implementation detail: whether to keep `incremental: true` in `tsconfig.json` (harmless either way).

## Acceptance Criteria

1. `grep "next" package.json` shows **no** `next`, `eslint-config-next`, `@next/bundle-analyzer`, or `server-only`; the file lists `vite`, `@tanstack/react-query`, `hono`, `@hono/node-server`, `@fontsource/archivo`, `@fontsource/inter`, and devDep `concurrently`.
2. No `next.config.ts`, `next-env.d.ts`, or `src/app/` directory exists in the repo.
3. No source file imports `next/*` or `server-only` (`grep -rn "next/\|server-only" src server` returns nothing).
4. `npm run build` (= `vite build`) succeeds and produces a static SPA in `dist/`.
5. `npm run typecheck` (`tsc --noEmit`) passes for `src/**`, `server/**`, `e2e/**`, and config files; `@/` resolves in `server/**` via `tsconfig.json paths`.
6. `npm run test` passes; **all pre-existing domain + data + features unit tests pass unchanged** (only import paths fixed if broken); the `WC_PROVIDER=mock` env addition does not alter any of them.
7. `GET /api/worldcup` served by Hono (port 8787) returns the **same** `ApiEnvelope<Tournament>` shape: `success: true`, `data.matches.length === 104`, `data.groups.length === 12` under `WC_PROVIDER=mock`; errors return `{ success: false, data: null, error: { code, message } }` with the `toApiError` HTTP status. In-browser/`request` calls reach it via the proxy (both `server.proxy` and `preview.proxy` defined — C1).
8. Client tournament data flows through **TanStack Query** `useQuery(['tournament'], …, { refetchInterval: 45_000 })`; **no `setInterval`/`AbortController` hand-rolled polling** remains (`grep -rn "setInterval" src` returns nothing; `useTournament.ts` deleted).
9. `RoadmapCanvas` destructures `{ data, loading }` from the new hook and renders identically; the Legend still reads `tournament?.meta.provider` (full `Tournament` returned — M4); LOD `data-lod`, loading overlay, React Flow props unchanged.
10. The FIFA `User-Agent`/pagination + TTL cache + single-flight + stale-on-error all run **server-side** in Hono via `vite-node` (CORS-safe); no FIFA fetch moved to the browser.
11. The favicon is preserved as `public/icon.png` via a **byte-for-byte copy** of `src/app/icon.png` (verified by matching file size/hash before the original is deleted) and referenced from `index.html`; the SPA tab shows the FIFA "26" mark (M1).
12. `global.css` (moved to `src/styles/`) keeps the Tailwind `@theme` tokens and `[data-lod]` LOD rules verbatim, and defines `--font-archivo`/`--font-inter` so the `@fontsource` families resolve and typography is unchanged.
13. `npm run dev` starts **both** the Vite web server (`vite`) and the Hono API (`vite-node --watch server/index.ts`) via `concurrently`; the SPA fetches `/api/worldcup` through the Vite `/api` → `:8787` proxy.
14. The two new test areas exist and pass: `server/routes/worldcup.test.ts` (with `WC_PROVIDER=mock` pinned before import — H2) and `useTournamentQuery.test.tsx` (jsdom pragma, node tests unaffected — M3); combined coverage on new/changed code ≥80%.
15. `playwright.config.ts` `baseURL` = `http://localhost:3217` and `webServer` is a two-entry array (preview SPA + `vite-node` API with `env: { WC_PROVIDER: 'mock' }`); e2e specs reference the same routes and the in-browser `/api` calls succeed through `preview.proxy`. (Execution may be skipped if Playwright browsers are unavailable here — gap documented, specs updated.)
16. No `console.log` in request paths, no hardcoded secrets; `env.ts` still validates `process.env` via zod and fails fast on bad config.

---

## Resolved review items (traceability)

| Item | Resolution location |
|---|---|
| C1 — `vite preview` ignores `server.proxy` | Approach ("RESOLVED — vite preview proxy"); `vite.config.ts` + `playwright.config.ts` rows; criteria #7, #15 |
| H1 — server `@/` alias runner | Approach ("RESOLVED — server `@/` alias runner") → **`vite-node`**; `package.json` row; criteria #5, #10, #13 |
| H2 — env parsed at import time | Approach ("RESOLVED — env parsed at import"); `server/routes/worldcup.test.ts`, `vitest.config.ts`, `playwright.config.ts` rows; criteria #6, #7, #14 |
| M1 — favicon binary copy | `public/icon.png` + `src/app/icon.png` rows; criterion #11 (hash/size check) |
| M2 — dropped `remotePatterns` | `next.config.ts` + `Flag.tsx` rows; Risks; library-first doc row |
| M3 — vitest jsdom strategy | `vitest.config.ts` + `vitest.setup.ts` rows; per-file pragma; criteria #6, #14 |
| M4 — `meta.provider` survives | `useTournamentQuery.ts` row + Data Model; criterion #9 |
| M5 — `queryClient` staleTime/gcTime | `src/lib/queryClient.ts` row + Data Model snippet; Risks |
| L1 — 15 `'use client'` files | "Remaining `'use client'` files (15 total)" row |
| L4 — name the runner | `concurrently` in `package.json` row; criteria #1, #13 |
