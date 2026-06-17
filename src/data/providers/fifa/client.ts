import { env } from '@/data/config/env';
import { RateLimitError, RepositoryError, ValidationError, getErrorMessage } from '@/data/errors';
import { rawMatchesResponseSchema, type RawMatch } from './schema';

const BASE = 'https://api.fifa.com/api/v3';

// Browser-like headers reduce the chance of bot-protection blocks on the
// undocumented FIFA endpoint.
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MAX_PAGES = 5;

/**
 * Fetch every WC 2026 match from the FIFA calendar endpoint, following the
 * ContinuationToken pagination. Throws RepositoryError/RateLimitError on HTTP
 * failure and ValidationError when the payload doesn't match the schema.
 */
export async function fetchFifaMatches(): Promise<RawMatch[]> {
  const all: RawMatch[] = [];
  let token: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${BASE}/calendar/matches`);
    url.searchParams.set('idCompetition', env.WC_FIFA_COMPETITION_ID);
    url.searchParams.set('idSeason', env.WC_FIFA_SEASON_ID);
    url.searchParams.set('count', '500');
    url.searchParams.set('language', 'en');
    if (env.WC_FIFA_COUNTRY) url.searchParams.set('country', env.WC_FIFA_COUNTRY);
    if (token) url.searchParams.set('continuationToken', token);

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (res.status === 429) throw new RateLimitError();
    if (!res.ok)
      throw new RepositoryError('UPSTREAM_HTTP', `FIFA API responded ${res.status}`, 502);

    let parsed;
    try {
      parsed = rawMatchesResponseSchema.parse(await res.json());
    } catch (error: unknown) {
      throw new ValidationError(`FIFA payload validation failed: ${getErrorMessage(error)}`);
    }

    const results = parsed.Results ?? [];
    all.push(...results);
    token = parsed.ContinuationToken ?? null;
    if (!token || results.length === 0) break;
  }

  return all;
}
