export interface ApiError {
  readonly code: string;
  readonly message: string;
}

/** Consistent response envelope for every API route. */
export type ApiEnvelope<T> =
  | { readonly success: true; readonly data: T; readonly error: null }
  | { readonly success: false; readonly data: null; readonly error: ApiError };

export function ok<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null };
}

export function fail(code: string, message: string): ApiEnvelope<never> {
  return { success: false, data: null, error: { code, message } };
}
