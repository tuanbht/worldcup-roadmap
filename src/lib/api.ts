// Join the configured Hono API origin with a relative API path.
//
// `VITE_API_BASE_URL` is the Hono ORIGIN only (e.g. `http://localhost:8787`),
// no trailing path. In production the static SPA and the Hono API live on
// separate origins with no Vite proxy, so the client must call the absolute
// origin directly. In dev (or any setup without the env var) the base is unset
// and `apiUrl` returns the relative path unchanged so the Vite `/api` proxy
// keeps resolving it.

/** Read the configured base lazily so `vi.stubEnv` is observed per-call in tests. */
function readBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Join the configured Hono origin (`VITE_API_BASE_URL`) with a relative API
 * path. Unset/empty/whitespace base → returns `path` unchanged (relative
 * dev-proxy fallback). When a base is set, the join carries exactly one slash:
 * any trailing slash on the base and missing/extra leading slash on the path
 * are normalized.
 */
export function apiUrl(path: string): string {
  const base = readBase();
  if (!base) return path;

  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = path.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
}
