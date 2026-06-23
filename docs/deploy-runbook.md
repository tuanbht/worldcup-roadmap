# Deploy runbook

Operational notes for deploying the World Cup roadmap. It is a **pure static SPA**
— there is no backend, no serverless function, and no CORS to configure. The
browser fetches the FIFA API directly.

## Topology: single static project (Vercel / any CDN)

```bash
npm ci
npm run build        # → dist/  (static assets only)
```

Serve `dist/` from a CDN/static host. There is nothing to "run in parallel": the
SPA calls `api.fifa.com` from the user's browser. FIFA returns
`Access-Control-Allow-Origin: *` to a plain browser fetch, so no proxy and no
same-origin reverse proxy are required.

### Vercel

- Framework preset: **Vite**.
- Build command: `npm run build`.
- Output directory: `dist`.
- No functions, no `api/` directory, no environment runtime needed.

## Configuration (build-time, optional)

All config is build-time Vite client env (`VITE_FIFA_*`, see `.env.example`) and
is inlined into the static bundle at `npm run build`. None are secrets and none
are required — with no env the app runs against the mock fixture (the `auto`
provider falls back to mock when FIFA is unreachable).

| Var | Default | Purpose |
| --- | --- | --- |
| `VITE_FIFA_PROVIDER` | `auto` | `auto` / `fifa` / `mock` data source. |
| `VITE_FIFA_BASE_URL` | `https://api.fifa.com/api/v3` | FIFA API origin. |
| `VITE_FIFA_COMPETITION_ID` | `17` | WC 2026 competition id. |
| `VITE_FIFA_SEASON_ID` | `285023` | WC 2026 season id. |
| `VITE_FIFA_COUNTRY` | `US` | `?country=` hint; empty string omits the param. |

## Caching

There is no shared server cache. Each browser fetches FIFA itself; load is bounded
by focus-only refetch + a per-client `staleTime` + honoring FIFA's own HTTP
`Cache-Control` (the client fetches do not set `cache: 'no-store'`).
