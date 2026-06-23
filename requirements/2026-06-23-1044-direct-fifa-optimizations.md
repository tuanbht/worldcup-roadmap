# Requirement: Direct-FIFA pure-SPA optimizations

> Companion to [2026-06-23-0955-direct-fifa-frontend.md](./2026-06-23-0955-direct-fifa-frontend.md) (the no-backend decision). Concrete,
> file-grounded optimization plan from a 5-dimension audit (network, bundle, deletion, resilience, deploy).

## Reality check (from the audit)

The cut-over **isn't done**: `useTournamentQuery`/`useMatchDetailQuery` still `fetch(apiUrl('/api/worldcup…'))`
(Hono), not `api.fifa.com`. So the keystone is executing the cut-over; most caching items only become correct
**after** it. Several audit items were dupes/already-done and are in _Skip_.

## 0. Keystone — execute the direct-FIFA cut-over

Rewrite both hooks to call the FIFA client / `FifaRepository` **in the browser** (not `apiUrl('/api/worldcup')`);
move `selectRepository`'s auto-with-mock-fallback into a **client factory**; swap server-only
`src/data/config/env.ts` (asserts `!window`) for browser-safe `import.meta.env` via the existing
`fifa-config.ts`; drop the `ApiEnvelope` unwrap (throw fetch errors straight to TanStack Query). **Everything
below depends on this.** (This is the implementation of `2026-06-23-0955-direct-fifa-frontend.md`.)

## 1. Quick wins (no backend change — ship in parallel)

- **`onlyRenderVisibleElements={true}`** on `<ReactFlow>` (`RoadmapCanvas.tsx:136`) — virtualize the 64-100+
  nodes; cuts pan/zoom paint, esp. mobile. (verify prop in @xyflow/react 12.4.4)
- **Preconnect/dns-prefetch** `api.fifa.com` (+ `digitalhub.fifa.com`) in `index.html` — flags/photos already
  hit these; saves 100-300ms on first fetch.
- **`vercel.json`** — immutable `Cache-Control` for `/assets/*` (Vite-hashed) + security headers (HSTS,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`)
  - a **CSP** allowlisting `connect-src`/`img-src` for `api.fifa.com` + `digitalhub.fifa.com`. (tighten
    `connect-src` after cut-over.)
- **Confirm no secrets** in `.env*` — only public IDs (`WC_FIFA_COMPETITION_ID=17`, `SEASON_ID`); Vite inlines
  `VITE_*` at build, so verify the public-only assumption + that CI never logs env.
- **staleTime/gcTime tiers** in `queryClient.ts` — 30s baseline, `gcTime` ~15-30m, longer `staleTime` when no
  match is live (ports the deleted server `WC_CACHE_TTL_LIVE/IDLE` tiering).

## 2. Deletions (now-dead with the backend — ~1030+ LOC)

- `server/` entirely (`index.ts`, `routes/{worldcup,match-detail,error-mapping}.ts`, `cors.ts` + tests).
- `src/data/cache/{tournament-cache,match-detail-cache}.ts` (+ tests) → replaced by TanStack staleTime/gcTime
  - persistence.
- `src/data/config/env.ts` (+ test) → `import.meta.env` via `fifa-config.ts`.
- `src/data/envelope.ts` (`ok`/`fail`) → throw fetch errors to TanStack Query.
- `src/data/repository-factory.ts` + `repository.ts` interface → small client factory (or
  `new FifaRepository(new MockRepository())`).
- `src/lib/api.ts` (`apiUrl`) + `VITE_API_BASE_URL` (just shipped in `43ae7ea`).
- `package.json`: `dev:api`/`start:api` scripts + deps `hono`, `@hono/node-server`, `concurrently`, `vite-node`
  (`dev` becomes plain `vite`).
- `vite.config.ts` `proxy`/`preview.proxy`; `CORS_*` in `.env.example`; `docs/deploy-runbook.md` reverse-proxy/
  CORS sections.

## 3. Bigger bets (post cut-over, in order)

- **Remove `cache:'no-store'`** from the FIFA clients (`client.ts` `fetchCalendarPage`, `match-detail-client.ts`
  `fetchSection`) so the browser honors FIFA `Cache-Control`; keep `AbortSignal.timeout`. First add a
  **DEV-only logger** of `Cache-Control`/`ETag`/`Age` to set TTLs from evidence (don't guess).
- **Persist the TanStack cache to `localStorage`** (`@tanstack/react-query-persist-client` +
  `createSyncStoragePersister`) so reloads/repeat visits hydrate instantly — replaces the lost edge cache,
  kills the F5 refetch spike. **Choose this over a Service Worker.**
- **429-aware retry** in `queryClient.ts`: a `retry` fn returning `false` for `RateLimitError`/4xx + `retryDelay`
  with exponential backoff + jitter (the browser is now the rate-limited client; avoid a thundering herd).
- **Lazy-split** the match-detail mapper (209 LOC) + schemas (171 LOC) inside `useMatchDetailQuery`'s `queryFn`
  - `React.lazy` the panel — defers ~15-40KB off the browse-without-details path. (Canvas is already a separate
    280KB chunk — don't re-split it.)
- **Fix the bracket feeder map** (correctness; schedule independently): `build-bracket.ts:89-100` pairs R32 via
  `childNodes[slot*2]/[slot*2+1]` (naive) — replace with the **official 2026 R32→R16→QF feeder map** resolved
  via `matchById` (mock mirrors it at `build-mock-tournament.ts:244-245`). **Verify real FIFA R32 ordering
  first.** (This is the long-open `fifa-regulation-accurate-bracket` gap.)

## Recommended order

1. Quick wins (§1) — parallel, no backend change.
2. Cut-over (§0).
3. Delete the backend (§2).
4. Remove `no-store` + DEV header probe → set staleTime/gcTime from what it shows.
5. 429 retry/backoff + localStorage persistence.
6. Lazy-split match-detail.
7. Bracket feeder fix (independent, verify against real FIFA ordering).

## Skip (audit flagged as wasted effort)

- **Service Worker SWR** — redundant with localStorage persistence for a read-only app; SW lifecycle/cache-bust
  cost isn't worth it.
- **Vercel `/api/* → api.fifa.com` rewrite** — reintroduces the proxy hop the cut-over removes; call FIFA direct.
- The **7 hook-level "remove `cache:no-store`" dupes** — those fetches hit Hono and get **deleted**.
- **Deep-compare `MatchNode` memo**, **narrowing every Zod `.passthrough()`**, **custom `@font-face`** (just drop
  the unused weight-600 import), **PlayerChip CLS** (already fixed) — low/no value.

## Acceptance criteria

- Hooks fetch `api.fifa.com` directly; no `apiUrl`/`/api/worldcup`/`server/` remain; `npm run build` is
  static-only and `hono` deps are gone.
- `onlyRenderVisibleElements` on; preconnect + `vercel.json` (headers + CSP) present; no secrets in the bundle.
- FIFA clients drop `cache:'no-store'`; query cache persists to `localStorage`; 429s back off (no retry storm).
- Match-detail mapper/panel are lazy chunks; bracket pairing matches the official feeder map (or the gap is
  explicitly deferred).
