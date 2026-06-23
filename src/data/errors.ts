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

/**
 * An upstream request exceeded its abort deadline (a hung/slow provider socket).
 * Mirrors the `UPSTREAM_HTTP` 502 shape so the route surfaces a clean gateway
 * error instead of pinning a never-resolving single-flight promise.
 */
export class UpstreamTimeoutError extends RepositoryError {
  constructor(message = 'FIFA API request timed out') {
    super('UPSTREAM_TIMEOUT', message, 502);
    this.name = 'UpstreamTimeoutError';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}
