# Requirement: Migrate Next.js → Vite + React (keep a thin backend)

> **Supersedes** the "Keep Next.js 15" decision in `2026-06-17-1645-library-first-stack-policy.md`.
>
> **⚠️ BACKEND PART SUPERSEDED by [2026-06-23-0955-direct-fifa-frontend.md](./2026-06-23-0955-direct-fifa-frontend.md):** keep the Vite + React
> migration, but **remove the Hono backend** entirely — the SPA fetches FIFA directly. Ignore every "thin Hono
> backend" / `server/` / `@hono/*` reference below; the Next→Vite/React parts still apply.

## Context

The owner prefers plain React over Next.js. The app **does** have a backend — a BFF that proxies the FIFA API,
validates + normalizes it, and caches it (liveness-tiered TTL, single-flight, stale-on-error) behind
`GET /api/worldcup`. That backend exists for hard reasons: **FIFA's endpoint is CORS-blocked from browsers**,
the bot-evading `User-Agent` header can't be set client-side, and one shared cache must absorb all polling.
So this is **not** a pure-frontend app, and a straight "Next → SPA" drop would break live data.

## Decision (resolved with owner)

- **Migrate to Vite + React (latest) + TypeScript.** Remove Next.js entirely. **Hard cutover** (no parallel
  parity phase — replace in one pass and get it green).
- **Keep a thin standalone backend** so live data keeps working: a small **Hono** Node API exposing
  `GET /api/worldcup`, reusing the existing `src/domain` + `src/data` essentially unchanged (only the Next
  route handler is Next-specific). Express is an acceptable alternative.
- **Frontend fetches via TanStack Query** (`@tanstack/react-query`) — this is the owner's stated choice and
  also closes the library-first gap (replaces the hand-rolled `useTournament` fetch+`setInterval`).

> The only framework-coupled code is `src/app/**` (layout, page, globals, the `/api/worldcup` route) and the
> `server-only` import in `env.ts`. `src/domain`, `src/data`, `src/features`, `src/components` are
> framework-agnostic TS and carry over as-is.

## Target architecture (one repo, two processes)

> **Reconciled (Batch G — `2026-06-23-0923-fix-direct-api-connection.md`):** the original plan had the
> SPA fetch a **relative** `/api/worldcup` resolved by the Vite dev proxy. That is
> superseded: the SPA now connects to the Hono API **origin directly** via
> `VITE_API_BASE_URL` (built through `src/lib/api.ts` → `apiUrl()`), so production
> (static SPA + separate API origin, no proxy) works. The `/api` proxy below is an
> **optional dev/preview fallback** used only when `VITE_API_BASE_URL` is unset.
> Direct cross-origin GETs are gated by the `server/cors.ts` origin allowlist.

```
wc-roadmap/
├── index.html                 # Vite entry (was Next app shell)
├── vite.config.ts             # OPTIONAL dev fallback proxy /api -> http://localhost:8787
├── src/                       # FRONTEND (Vite + React)
│   ├── main.tsx               # ReactDOM.createRoot + QueryClientProvider
│   ├── App.tsx                # was app/page.tsx body
│   ├── styles/global.css      # was app/globals.css (+ Tailwind)
│   ├── domain/  data/         # SHARED, imported by both web + server (unchanged)
│   ├── features/  components/ # unchanged React Flow UI
│   └── lib/queryClient.ts
├── server/                    # BACKEND (Hono)
│   ├── index.ts               # @hono/node-server; GET /api/worldcup
│   └── routes/worldcup.ts     # reuse selectRepository() + getCachedTournament()
└── package.json               # scripts: dev:web (vite), dev:api (tsx server), dev (both)
```

### What moves where

| Next thing                            | Replacement                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/app/api/worldcup/route.ts`       | `server/routes/worldcup.ts` (Hono handler — same `ok/fail` envelope, ~15 lines)                                    |
| `src/app/layout.tsx` + `globals.css`  | `index.html` + `src/main.tsx` + `src/styles/global.css`                                                            |
| `src/app/page.tsx`                    | `src/App.tsx`                                                                                                      |
| `next/font` (Archivo, Inter)          | `@fontsource/archivo` + `@fontsource/inter` (self-hosted, `font-display: swap`)                                    |
| `next/image` (flags)                  | plain `<img loading="lazy" width height>` (or keep `Flag.tsx`, drop next/image)                                    |
| `server-only` import in `env.ts`      | delete the import; keep the zod `process.env` validation (now plain Node env)                                      |
| `useStageView` `history.replaceState` | keep, or React Router (light — app is essentially single-page)                                                     |
| `useTournament` (fetch+setInterval)   | `useQuery(['tournament'], …)` — focus-only refetch, no interval (see `2026-06-23-0853-refetch-on-window-focus.md`) |

### Reused unchanged

`src/data/providers/**` (FIFA client + mock), `repository.ts`, `repository-factory.ts`, `cache/tournament-cache.ts`,
`data/envelope.ts`, `data/errors.ts`, `data/schema/**`, all of `src/domain/**`, all of `src/features` + `src/components`.
The FIFA `User-Agent`/pagination logic now runs in the Hono server (still server-side → still works).

## Dependencies

- **Add:** `vite`, `@vitejs/plugin-react`, `@tanstack/react-query`, `hono`, `@hono/node-server`,
  `@fontsource/archivo`, `@fontsource/inter`, `tsx` (run the API in dev).
- **Remove:** `next`, `eslint-config-next`, `server-only`; delete `next.config.ts`, `next-env.d.ts`.
- **Keep:** `react`, `react-dom`, `@xyflow/react`, `zod`, `tailwindcss`, `@tailwindcss/postcss`, `vitest`,
  `@playwright/test`, `typescript`. (Vitest already uses Vite — config simplifies.)

## Sequencing (hard cutover)

1. Add Vite (`index.html`, `vite.config.ts` with `/api` proxy, `src/main.tsx` w/ `QueryClientProvider`).
2. Stand up `server/` (Hono) with `GET /api/worldcup` reusing `selectRepository()` + `getCachedTournament()`.
3. Port `app/layout`+`page`+`globals` → `App.tsx` + `index.html` + `global.css`; wire Tailwind via PostCSS.
4. Swap `useTournament` → TanStack Query `useQuery` (focus-only refetch, no interval); replace `next/font`, `next/image`.
5. Delete `next`, `src/app/`, `next.config.ts`, `next-env.d.ts`, `server-only`; fix imports.
6. Update `package.json` scripts + the Playwright config/baseURL; run typecheck, tests, e2e, build.

## Acceptance criteria (testable)

- No Next remnants: `grep -r "next" package.json` shows no `next`/`eslint-config-next`/`server-only`; no
  `next.config.ts`, `next-env.d.ts`, or `src/app/`.
- `vite build` succeeds; `GET /api/worldcup` (Hono) returns the **same** `ApiEnvelope<Tournament>` shape.
- Frontend data comes through **TanStack Query** (no hand-rolled `setInterval` polling); refetch is focus-only
  (see `2026-06-23-0853-refetch-on-window-focus.md`).
- All existing **domain + data unit tests pass unchanged** (they're framework-agnostic); e2e updated to the new
  dev URL and green.
- Live FIFA data still flows through the server proxy + cache (CORS-safe); dev runs `web` + `api` together.

## Risks / notes

- **CORS is exactly why the backend stays** — do not move the FIFA fetch into the browser.
- Lose Next SSR/SEO/RSC (acceptable for this interactive app) and `next/image`/`next/font` conveniences (replaced).
- Deployment becomes two artifacts: a static SPA (any CDN/host) + the Hono API (Node host, or serverless later).
- `vitest.config.ts` coverage `include` paths and the `@` alias must match the new layout.

## If you want ZERO backend instead (fallback)

Only viable as **mock-data-only**: bundle `buildMockTournament()` output as a static `tournament.json` import,
drop `server/`, FIFA provider, cache, and `env.ts`. Pure Vite SPA, no live data. Flip to this if a backend is
unacceptable — but it loses the live FIFA feature.

## Doc reconciliation

Update `2026-06-17-1645-library-first-stack-policy.md` bundler row: "Keep Next.js 15" → **superseded; Vite SPA + Hono API**.
`2026-06-17-1645-zoomable-roadmap-graph.md`'s Vite mention is now the chosen path.
