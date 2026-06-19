import { env } from '@/data/config/env';
import {
  RateLimitError,
  RepositoryError,
  UpstreamTimeoutError,
  ValidationError,
  getErrorMessage,
} from '@/data/errors';
import { rawMatchesResponseSchema, type RawMatch } from './schema';

/** Shared FIFA v3 API base (reused by the per-match detail client). */
export const BASE = 'https://api.fifa.com/api/v3';

/**
 * Shared request deadline for EVERY FIFA `fetch` (calendar pager + both detail
 * sections). A post-connect-hung FIFA socket otherwise pins the per-key
 * single-flight `inflight` promise in the cache layer for minutes; an
 * `AbortSignal.timeout(ms)` caps each call so a slow upstream fails fast instead.
 */
export const FIFA_FETCH_TIMEOUT_MS = 9_000;

/**
 * True for the abort-style rejections a timed-out `fetch` surfaces: undici throws
 * a `TimeoutError` for `AbortSignal.timeout`, an `AbortError` for a manually
 * aborted controller. Keyed on `.name` so both runtime variants map to a timeout
 * and every other error (network reset, parse failure, …) passes through.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

// Browser-like headers reduce the chance of bot-protection blocks on the
// undocumented FIFA endpoint. Exported so the detail client reuses them verbatim.
export const FIFA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MAX_PAGES = 5;

/** Build the calendar-page URL for a given continuation token (null = first page). */
function calendarPageUrl(token: string | null): URL {
  const url = new URL(`${BASE}/calendar/matches`);
  url.searchParams.set('idCompetition', env.WC_FIFA_COMPETITION_ID);
  url.searchParams.set('idSeason', env.WC_FIFA_SEASON_ID);
  url.searchParams.set('count', '500');
  url.searchParams.set('language', 'en');
  if (env.WC_FIFA_COUNTRY) url.searchParams.set('country', env.WC_FIFA_COUNTRY);
  if (token) url.searchParams.set('continuationToken', token);
  return url;
}

/**
 * Fetch + parse one calendar page under a finite abort deadline. An abort/timeout
 * becomes `UpstreamTimeoutError` (502); a non-OK / 429 / schema failure becomes
 * the existing typed errors. Every other error rethrows untouched.
 */
async function fetchCalendarPage(url: URL): Promise<{ results: RawMatch[]; token: string | null }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: FIFA_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(FIFA_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isAbortError(error)) throw new UpstreamTimeoutError();
    throw error;
  }
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new RepositoryError('UPSTREAM_HTTP', `FIFA API responded ${res.status}`, 502);

  try {
    const parsed = rawMatchesResponseSchema.parse(await res.json());
    return { results: parsed.Results ?? [], token: parsed.ContinuationToken ?? null };
  } catch (error: unknown) {
    throw new ValidationError(`FIFA payload validation failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch every WC 2026 match from the FIFA calendar endpoint, following the
 * ContinuationToken pagination. Each page fetch carries a finite abort deadline
 * (`FIFA_FETCH_TIMEOUT_MS`). Throws UpstreamTimeoutError on abort,
 * RepositoryError/RateLimitError on HTTP failure, and ValidationError when the
 * payload doesn't match the schema.
 */
export async function fetchFifaMatches(): Promise<RawMatch[]> {
  const all: RawMatch[] = [];
  let token: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { results, token: next } = await fetchCalendarPage(calendarPageUrl(token));
    all.push(...results);
    token = next;
    if (!token || results.length === 0) break;
  }

  return all;
}
