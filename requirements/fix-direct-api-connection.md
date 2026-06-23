# Requirement (bug fix): Connect the SPA directly to the API, not via internal/relative routes

> **⚠️ SUPERSEDED by [direct-fifa-frontend.md](./direct-fifa-frontend.md).** Decision is **no backend** — the
> SPA fetches FIFA directly, so there is no internal/proxy API and no `VITE_API_BASE_URL` to point at. The
> `apiUrl()` / base-URL work that shipped in commit `43ae7ea` should be **reverted** as part of removing
> `server/`. Do not implement this doc.

## Bug

The frontend fetches the API with **relative paths**:

- `src/features/roadmap/hooks/useTournamentQuery.ts` → `const WORLDCUP_ENDPOINT = '/api/worldcup'`.
- `src/features/roadmap/hooks/useMatchDetailQuery.ts` → `fetch('/api/worldcup/match/${matchId}/detail')`.

These resolve **only** because `vite.config.ts` proxies `/api → http://localhost:8787` in dev and preview.
That relative/same-origin assumption is a leftover from the old **Next route handler** (colocated, internal).
But the **thin Hono replacement is a separate process/origin** (`:8787` in dev; a separate deployment in prod).
In production there is no Vite proxy, so a relative `/api/worldcup` hits the **static SPA host** and **404s** —
the API is never reached. (`server/cors.ts` already exists, which is only needed for _direct cross-origin_
SPA→API calls — the architecture expects a direct connection; the client just isn't wired for it.)

## Goal

Connect the SPA **directly** to the Hono API via a **configurable base URL**, removing the dependency on the
internal `/api` proxy route.

## Decision

1. **API base URL config** — `VITE_API_BASE_URL` (read via `import.meta.env.VITE_API_BASE_URL`), the Hono
   **origin** only (e.g. `http://localhost:8787` in dev, the deployed API origin in prod). No trailing path.
2. **`src/lib/api.ts`** — tiny helper `apiUrl(path: string)` that joins `VITE_API_BASE_URL` + `path`
   (e.g. `apiUrl('/api/worldcup')`). If the env is unset it falls back to a relative path (so existing
   dev-proxy setups still work), but the **intended** configuration is a direct absolute origin.
3. **Rewire both fetchers** — `useTournamentQuery` and `useMatchDetailQuery` build their URL via `apiUrl(...)`;
   no hardcoded relative `/api/...` remains in the data layer.
4. **Dev** — set `VITE_API_BASE_URL=http://localhost:8787` so the SPA talks to Hono **directly**; the Vite
   `/api` proxy becomes an optional fallback (keep for convenience or drop — direct is the supported path).
5. **CORS** — `server/cors.ts` must allow the SPA origin(s) for direct cross-origin requests: the dev SPA
   origin and a prod allowlist (env-driven, e.g. `CORS_ALLOWED_ORIGINS`). Verify/extend it.
6. **`.env.example`** — document `VITE_API_BASE_URL` (frontend) and the server CORS allowlist var.

## Reconcile other specs

Supersedes the "SPA fetches a **RELATIVE** `/api/worldcup`" + dev-proxy note in `migrate-to-vite-react.md`:
the SPA now connects to the API origin directly via `VITE_API_BASE_URL`.

## Acceptance criteria (testable)

- `grep -rn "'/api/worldcup'\|\"/api/worldcup\|fetch(\`/api/" src`shows the only API URLs are built through`apiUrl()` — no bare relative API paths in the fetchers.
- With `VITE_API_BASE_URL` pointed at the Hono origin and the **Vite `/api` proxy disabled**, the SPA still
  loads tournament + match-detail data (proves the direct connection works, not the proxy).
- A cross-origin `GET` from the SPA origin to the Hono API succeeds (CORS allows it); a disallowed origin is
  rejected.
- Production shape works: static SPA on origin A + Hono API on origin B, no `/api` 404, data loads.
- The fetcher unit tests construct URLs via `apiUrl()` (base injected/mocked); they pass.

## Notes

- One base URL, shared by both endpoints. The Hono server stays the BFF (still proxies FIFA + caches
  server-side) — only the **client→API hop** changes from internal-proxy to direct.
- This pairs with the focus-only refetch change (`refetch-on-window-focus.md`); both touch the same two query
  hooks, so implement together to avoid churn.
