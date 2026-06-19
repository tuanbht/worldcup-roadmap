# Deploy runbook

Operational notes for deploying the World Cup roadmap (static SPA + standalone
Hono API process).

## Same-origin reverse-proxy assumption (default)

By default the API process registers **no CORS middleware**, so `/api/*`
responses carry no `Access-Control-Allow-Origin` header. This is intentional and
safe **only** when the SPA and the API are served from the **same origin**.

The supported topology is a same-origin reverse proxy: a single front door
(the Vite dev/preview server in development, or your CDN/edge reverse proxy in
production) serves the static SPA and forwards `/api/*` to the Hono process.
Because the browser sees one origin, requests are not cross-origin and no CORS
headers are needed. Keep this layout unless you have a specific reason to split
the hosts.

## CORS opt-in for split deploys: `CORS_ALLOWED_ORIGIN`

If you must host the static bundle and the API on **different origins** (for
example, static assets on a CDN host and the API on a separate API host), set
the `CORS_ALLOWED_ORIGIN` environment variable on the API process to the exact
origin the SPA is served from:

```bash
CORS_ALLOWED_ORIGIN=https://app.example.com
```

Behavior:

- **Unset / empty** — no CORS middleware is registered; behavior is unchanged
  (same-origin only). No `Access-Control-Allow-Origin` header is emitted.
- **Set to an origin** — `hono/cors` restricts `/api/*` to exactly that origin.
  A request whose `Origin` matches receives the matching
  `Access-Control-Allow-Origin`; any other origin is denied (no ACAO echoed).

Only a single exact origin is supported — no wildcard (`*`), no credentials, no
custom headers. Restricting to one trusted origin keeps the cross-origin surface
minimal. Add the new origin to this variable rather than broadening it.
