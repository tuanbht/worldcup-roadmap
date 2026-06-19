import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { RepositoryError, toApiError } from '@/data/errors';
import { DETAIL_UNAVAILABLE } from '@/data/detail-codes';

/** Shared Cache-Control for the public, cacheable JSON routes. */
export const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';

/** 500 fallback for any status Hono would not accept as a contentful code. */
const STATUS_FALLBACK: ContentfulStatusCode = 500;

/**
 * Frozen set of the exact status codes Hono accepts as a `ContentfulStatusCode`
 * — mirrors Hono's own union (Info/Success/Redirect/ClientError/ServerError)
 * minus the four contentless codes (101/204/205/304). The routes always send a
 * JSON `fail(...)` body, so the contentful subset is the sound narrow.
 *
 * This is a SET, not a `100 <= n <= 599` range: HTTP has gaps (419/420/512 are
 * unassigned), and a range check would wrongly pass those through.
 */
const CONTENTFUL_STATUS: ReadonlySet<number> = new Set<ContentfulStatusCode>([
  100, 102, 103, 200, 201, 202, 203, 206, 207, 208, 226, 300, 301, 302, 303, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508,
  510, 511,
]);

/**
 * Narrow an arbitrary number to a Hono `ContentfulStatusCode` at runtime.
 * Returns `n` (typed) when it is a valid contentful status, else `500`. Replaces
 * the unsound `as 429 | 500 | 502` cast in the route catch blocks (CR-6).
 */
export function toHttpStatus(n: number): ContentfulStatusCode {
  return CONTENTFUL_STATUS.has(n) ? (n as ContentfulStatusCode) : STATUS_FALLBACK;
}

export interface MappedError {
  readonly code: string;
  readonly message: string;
  readonly http: number;
}

/** True for a `RepositoryError`-shaped value (has code + numeric httpStatus). */
export function isRepositoryErrorShape(
  error: unknown,
): error is { code: string; message: string; httpStatus: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { httpStatus?: unknown }).httpStatus === 'number' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/**
 * Map a thrown error to `{ code, message, http }`.
 *
 * Prefers the shared `toApiError`. As a fallback we duck-type the
 * `RepositoryError` shape: a server process can hold more than one module
 * instance of `@/data/errors`, in which case `instanceof RepositoryError` (used
 * inside `toApiError`) is identity-sensitive and would mis-map a domain error to
 * a generic 500. The structural check keeps the upstream code/status intact.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof RepositoryError || !isRepositoryErrorShape(error)) {
    return toApiError(error);
  }
  return { code: error.code, message: error.message, http: error.httpStatus };
}

// Re-export the shared code constant for the route's convenience; its canonical
// home stays under `src/` so the client bundle can import it too (no src/→server).
export { DETAIL_UNAVAILABLE };
