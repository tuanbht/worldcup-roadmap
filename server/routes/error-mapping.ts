import { RepositoryError, toApiError } from '@/data/errors';
import { DETAIL_UNAVAILABLE } from '@/data/detail-codes';

/** Shared Cache-Control for the public, cacheable JSON routes. */
export const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';

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
