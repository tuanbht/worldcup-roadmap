# Requirement: Correctness & hardening — CR-6, CR-7, CR-8, CR-13

Source: `requirements/change-request-2026-06-19.md` (RECOMMENDED/LOW). Four small,
independent server + data-layer fixes bundled as one "correctness/hardening" unit.

---

## CR-6 — Replace the unsound HTTP-status cast with a runtime narrow

`server/routes/worldcup.ts` (~line 22) and the sibling match-detail route cast an
arbitrary `number` to Hono's status union with `as 429 | 500 | 502`. If an error
ever carries a status outside that set, the cast lies to the type system.

### Fix

Add a `toHttpStatus(n: number): ContentfulStatusCode` (or Hono's `StatusCode`)
helper that returns `n` when it is a valid HTTP status Hono accepts, else falls
back to `500`. Use it in BOTH routes instead of the `as` cast. Keep the existing
error→status mapping (`RepositoryError.httpStatus`, `RateLimitError` → 429, etc.).

### Acceptance

1. No `as`-cast to a status literal remains in the two routes; the helper narrows
   at runtime with a 500 fallback for out-of-range input.
2. A `RepositoryError`/`RateLimitError` still yields its intended status
   (429/500/502); an unexpected status degrades to 500, never a type lie.
3. Unit tests cover the helper (in-range passthrough + out-of-range → 500).

---

## CR-7 — Add origin-restricted CORS (opt-in) + a deploy note

`server/index.ts` (~lines 14-18) registers no CORS. Fine behind the same-origin
Vite proxy, but a split static-host + separate-API deploy is SOP-blocked.

### Fix

Register Hono's `cors()` middleware on `/api/*`, **gated behind a
`CORS_ALLOWED_ORIGIN` env var**: when unset, behavior is unchanged (same-origin,
no CORS headers); when set, allow exactly that origin. Use `hono/cors` (already
available with Hono — no new dependency). Add a short deploy note (a `docs/`
runbook entry or a comment block) documenting the same-origin reverse-proxy
assumption and the `CORS_ALLOWED_ORIGIN` opt-in.

### Acceptance

4. With `CORS_ALLOWED_ORIGIN` unset, `/api/*` responses carry no
   `Access-Control-Allow-Origin` (default unchanged — no security regression).
5. With it set to an origin, a request from that origin gets the matching
   `Access-Control-Allow-Origin`; a different origin does not.
6. A deploy note documents the constraint + opt-in. Tests cover #4 and #5.

---

## CR-8 — Guard `env.ts` against client import

`src/data/config/env.ts` (~line 20) reads `process.env` at module-eval and lives
under `src/`; a future client bundle importing it crashes the SPA (`process` is
undefined in the browser).

### Fix

Add a server-only guard at the top of the module: if it is evaluated in a browser
context (`typeof window !== 'undefined'` / `typeof process === 'undefined'`),
throw a clear "server-only module — do not import from client code" error so an
accidental client import fails loudly and descriptively at the boundary instead
of a cryptic `process is not defined`. Keep the module under `src/` (moving it to
`server/` would break the existing `@/data/config/env` imports — the `@` alias
maps to `src/` only).

### Acceptance

7. Importing/initializing `env` in a simulated browser context (window defined /
   process undefined) throws a clear, descriptive server-only error.
8. In the server context the existing behavior is unchanged (env reads succeed,
   required-var validation intact). Tests cover both.

---

## CR-13 — Forward the query `signal` in `useMatchDetailQuery`

`src/features/roadmap/hooks/useMatchDetailQuery.ts` (~lines 22-35) ignores
TanStack Query's `QueryFunctionContext.signal`, so an in-flight detail request is
not cancelled on unmount or query-key change.

### Fix

Thread `signal` from the query function context into the underlying `fetch`
(`queryFn: ({ signal }) => fetchMatchDetail(id, { signal })` → `fetch(url, { signal })`).
Keep the existing error/parse handling.

### Acceptance

9. The detail fetch receives the TanStack-provided `AbortSignal`; an unmount /
   key-change aborts the in-flight request.
10. Happy path unchanged; existing `useMatchDetailQuery` tests stay green; a new
    test asserts the signal is forwarded.

---

## Constraints (whole requirement)

- Library-first: use `hono/cors` and the platform `fetch`/`AbortSignal`; reuse
  existing error types. No new dependencies.
- Immutability + explicit boundary handling per the coding-style rules; small
  focused functions.
- All gates green and deterministic: `npm run test`, `npm run typecheck`,
  `npm run build`, `npx prettier --check` on touched files.

## Files likely touched

- `server/routes/worldcup.ts` + the sibling match-detail route (+ tests) — CR-6
- `server/index.ts` + a `docs/` deploy note (+ test) — CR-7
- `src/data/config/env.ts` (+ test) — CR-8
- `src/features/roadmap/hooks/useMatchDetailQuery.ts` (+ test) — CR-13
