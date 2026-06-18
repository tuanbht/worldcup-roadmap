/**
 * Canonical, client-importable shared error code for "match detail unavailable".
 *
 * Home is under `src/` so BOTH the Hono detail route and the frontend query hook
 * reach it via the `@` alias — no `src/ → server/` crossing (module-boundary H-1).
 */
export const DETAIL_UNAVAILABLE = 'DETAIL_UNAVAILABLE';
