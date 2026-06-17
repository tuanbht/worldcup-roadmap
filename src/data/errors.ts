/** Base error for any data-layer / provider failure, carrying an HTTP status. */
export class RepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 502,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/** Upstream data failed schema validation. */
export class ValidationError extends RepositoryError {
  constructor(message: string) {
    super('UPSTREAM_INVALID', message, 502);
    this.name = 'ValidationError';
  }
}

/** Upstream provider rejected us for rate limiting. */
export class RateLimitError extends RepositoryError {
  constructor(message = 'Upstream rate limit reached') {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export function toApiError(error: unknown): { code: string; message: string; http: number } {
  if (error instanceof RepositoryError) {
    return { code: error.code, message: error.message, http: error.httpStatus };
  }
  return { code: 'INTERNAL', message: getErrorMessage(error), http: 500 };
}
