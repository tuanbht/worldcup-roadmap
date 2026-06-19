import type { ProviderRef } from '@/domain/types';
import { BASE, FIFA_FETCH_TIMEOUT_MS, FIFA_HEADERS } from './client';
import {
  rawMatchLiveSchema,
  rawTimelineSchema,
  type RawMatchLive,
  type RawTimeline,
} from './match-detail-schema';

export interface FifaMatchDetailRaw {
  readonly live: RawMatchLive | null;
  readonly timeline: RawTimeline | null;
}

/** Guard against pathological payloads exhausting memory before zod runs. */
const MAX_BYTES = 4_000_000;

function detailPath(kind: 'live/football' | 'timelines', ref: ProviderRef): string {
  const { idCompetition, idSeason, idStage, idMatch } = ref;
  return `${BASE}/${kind}/${idCompetition}/${idSeason}/${idStage}/${idMatch}`;
}

/**
 * Fetch + zod-validate one FIFA detail endpoint under a finite abort deadline
 * (`FIFA_FETCH_TIMEOUT_MS`). On HTTP / abort-timeout / oversized / empty /
 * invalid-JSON / schema failure returns `null` so the mapper degrades to empty —
 * it never throws into a route crash. The shared deadline stops a hung FIFA
 * socket from pinning the section; the existing catch turns that abort into the
 * same graceful `null` as any other failure.
 */
async function fetchSection<T>(url: string, parse: (value: unknown) => T): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: FIFA_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(FIFA_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length > MAX_BYTES) return null;
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Fetch the FIFA `/live/football/...` and `/timelines/...` payloads for one
 * match in parallel. Each section degrades to `null` independently; the mapper
 * tolerates any combination (both, one, or neither).
 */
export async function fetchFifaMatchDetail(ref: ProviderRef): Promise<FifaMatchDetailRaw> {
  const [live, timeline] = await Promise.all([
    fetchSection(detailPath('live/football', ref), (v) => rawMatchLiveSchema.parse(v)),
    fetchSection(detailPath('timelines', ref), (v) => rawTimelineSchema.parse(v)),
  ]);
  return { live, timeline };
}
