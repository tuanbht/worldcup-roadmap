import type { ProviderRef } from '@/domain/types';
import { BASE, FIFA_FETCH_TIMEOUT_MS } from './client';
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

export interface FetchFifaMatchDetailOptions {
  /** Caller abort signal (TanStack Query's) — combined with the fetch deadline. */
  readonly signal?: AbortSignal;
}

/** Guard against pathological payloads exhausting memory before zod runs. */
const MAX_BYTES = 4_000_000;

function detailPath(kind: 'live/football' | 'timelines', ref: ProviderRef): string {
  const { idCompetition, idSeason, idStage, idMatch } = ref;
  return `${BASE}/${kind}/${idCompetition}/${idSeason}/${idStage}/${idMatch}`;
}

/**
 * Build the per-fetch abort signal: always a finite `FIFA_FETCH_TIMEOUT_MS`
 * deadline, combined with the caller's signal when one is provided so a
 * cancelled query (different match selected, panel closed) aborts the in-flight
 * detail fetch too.
 */
function buildSignal(caller?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(FIFA_FETCH_TIMEOUT_MS);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

/**
 * Fetch + zod-validate one FIFA detail endpoint as a plain browser fetch under a
 * finite abort deadline (`FIFA_FETCH_TIMEOUT_MS`). On HTTP / abort-timeout /
 * oversized / empty / invalid-JSON / schema failure returns `null` so the mapper
 * degrades to empty — it never throws into a crash. No spoofed headers and no
 * `cache: 'no-store'` (the browser honors FIFA's own Cache-Control).
 */
async function fetchSection<T>(
  url: string,
  parse: (value: unknown) => T,
  caller?: AbortSignal,
): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: buildSignal(caller) });
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
 * tolerates any combination (both, one, or neither). A caller `signal` is
 * forwarded to both sections so a cancelled query aborts the in-flight fetches.
 */
export async function fetchFifaMatchDetail(
  ref: ProviderRef,
  options?: FetchFifaMatchDetailOptions,
): Promise<FifaMatchDetailRaw> {
  const [live, timeline] = await Promise.all([
    fetchSection(
      detailPath('live/football', ref),
      (v) => rawMatchLiveSchema.parse(v),
      options?.signal,
    ),
    fetchSection(detailPath('timelines', ref), (v) => rawTimelineSchema.parse(v), options?.signal),
  ]);
  return { live, timeline };
}
