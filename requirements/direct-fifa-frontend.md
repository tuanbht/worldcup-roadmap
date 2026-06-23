# Requirement: Pure frontend — fetch FIFA directly, delete the backend

> **Confirmed:** `api.fifa.com/api/v3/{calendar/matches, live/football/…, timelines/…}` return
> `Access-Control-Allow-Origin: *` and `200` to a plain browser `fetch()` (no custom headers). The browser can
> call FIFA directly. The Hono BFF is **not** needed for access. Go pure frontend.

## Decision

1. **Delete the backend.** Remove `server/` entirely (`index.ts`, `routes/*`, `cors.ts`, `deploy-runbook*`),
   drop deps `hono` + `@hono/node-server`, remove the Vite `/api` proxy, and remove the
   `VITE_API_BASE_URL`/`apiUrl` indirection (supersedes `fix-direct-api-connection.md`).
2. **Move the data layer into the browser.** The FIFA client, zod schemas, FIFA→domain mappers, and
   stats-derivation under `src/data/providers/fifa/*` are already framework-agnostic TS — run them client-side.
   - **Drop the spoofed `User-Agent`/`Accept-Language` headers** (forbidden in the browser and unnecessary —
     a plain request 200s). Keep `ContinuationToken` pagination.
   - Tournament is assembled client-side via the existing domain builders (`buildBracket`, `computeGroups`, …).
3. **Config → client.** FIFA base + `idCompetition`/`idSeason`/`country` become build-time client config
   (`VITE_FIFA_*` or a const module). Not secrets.
4. **TanStack Query, direct.**
   - `useTournamentQuery` → fetch `…/calendar/matches?...&count=500` directly, map → `Tournament`.
   - `useMatchDetailQuery` → fetch `…/live/football/…` + `…/timelines/…` directly, map → `MatchDetail`
     (supersedes the `/api/worldcup/match/:id/detail` Hono endpoint in `match-detail-panel.md`).
   - **Focus-only refetch** (per `refetch-on-window-focus.md`) + a per-client `staleTime` so a single user
     doesn't hammer FIFA. No `refetchInterval`.
5. **Keep the mock provider as a fallback.** Preserve `buildMockTournament` and the `auto` behavior client-side:
   try FIFA, fall back to mock on failure (also powers offline/CI/tests). Drop the server TTL cache +
   single-flight (no shared process to host them).
6. **Remove the API envelope hop.** No internal `/api/*` routes → the client maps FIFA responses straight to
   domain types; `data/envelope.ts` (`ApiEnvelope`) is no longer needed for transport (keep only if a hook
   still wants a result shape).

## Deploy (resolves "can it run both")

**Single static Vercel project. No functions, no server.** `vite build` → `dist`, served by the CDN. There is
nothing to "run in parallel" — the SPA fetches FIFA directly from the user's browser.

## Supersedes

- `migrate-to-vite-react.md` — keep Vite+React; **drop the "thin Hono backend"** part (no backend at all).
- `fix-direct-api-connection.md` — no internal API to point at; the SPA calls FIFA directly.
- `match-detail-panel.md` — match detail comes from FIFA `live`+`timelines` directly, not a Hono route.

## Risks (the real ones — CORS is NOT one)

- **No shared cache.** Each browser hits FIFA itself. Mitigated by focus-only refetch + `staleTime` + honoring
  FIFA's own HTTP cache headers. Acceptable for this traffic.
- **Undocumented & could change under tournament load** (bot-challenge, rate-limit, CORS/shape change) — the
  **mock fallback** is the safety net so the app degrades instead of breaking.
- Client bundle grows by the mapper/zod code (small); FIFA IDs become client-visible (not secrets).

## Acceptance criteria (testable)

- No `server/` directory; `hono`/`@hono/node-server` removed from `package.json`; no Vite `/api` proxy.
- The SPA fetches `api.fifa.com` directly (TanStack Query); tournament graph + match-detail panel render from
  those direct fetches.
- Focus-only refetch; no `refetchInterval`; no internal `/api/*` calls remain.
- FIFA failure falls back to the mock tournament (app still renders).
- `vite build` produces a deployable static bundle; deploy is static-only (no serverless function).
- Client mapper/stats unit tests pass (ported from the former server tests).
