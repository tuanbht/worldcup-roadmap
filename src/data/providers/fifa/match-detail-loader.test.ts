// Node environment (global default). The loader is framework-agnostic
// orchestration — no DOM. It is the client-side port of the deleted Hono detail
// route (server/routes/match-detail.test.ts) MINUS the HTTP/envelope assertions.
//
// DETERMINISM: the FIFA detail fetch + mapper are mocked via `vi.mock` factories
// so no network is touched. Three distinct outcomes are pinned:
//   • match.providerRef == null         → 'unavailable' (never a thrown error)
//   • FIFA sections null, no throw       → 'ready' with an EMPTY_MATCH_DETAIL-shaped detail
//   • FIFA fetch THROWS                  → the error PROPAGATES (loader does not swallow)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, ValidationError } from '@/data/errors';
import { EMPTY_MATCH_DETAIL, teamRef } from '@/domain/types';
import type { Match, MatchDetail, ProviderRef } from '@/domain/types';

// --- Mocks: the loader composes these two FIFA units; both are mocked so the
// suite exercises the loader's orchestration/branching, not the network. ---
const fetchFifaMatchDetailMock = vi.fn();
const mapFifaMatchDetailMock = vi.fn();

vi.mock('./match-detail-client', () => ({
  fetchFifaMatchDetail: (...args: unknown[]) => fetchFifaMatchDetailMock(...args),
}));
vi.mock('./match-detail-mapper', () => ({
  mapFifaMatchDetail: (...args: unknown[]) => mapFifaMatchDetailMock(...args),
}));

// Imported AFTER the mocks are registered (vi.mock is hoisted, so this is safe).
import { loadMatchDetail } from './match-detail-loader';

const FIFA_REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '285023',
  idStage: 'st-r16',
  idMatch: '400251',
};

function makeMatch(id: string, providerRef: ProviderRef | null): Match {
  return {
    id,
    providerMatchId: id,
    providerRef,
    stage: 'ROUND_OF_16',
    group: null,
    matchday: null,
    home: teamRef({ id: 'h', name: 'France', code: 'FRA', flagUrl: null }),
    away: teamRef({ id: 'a', name: 'Brazil', code: 'BRA', flagUrl: null }),
    score: {
      home: 2,
      away: 1,
      penaltyHome: null,
      penaltyAway: null,
      resolution: 'regular',
      winner: 'home',
    },
    kickoff: '2026-07-04T16:00:00Z',
    status: 'finished',
    minute: null,
    venue: { name: null, city: null },
  };
}

const FIFA_MATCH = makeMatch('wc2026-fifa-400251', FIFA_REF);
const MOCK_MATCH = makeMatch('wc2026-mock-1', null);

/** A populated (non-empty) MatchDetail so a happy path is distinguishable from a degrade. */
function populatedDetail(matchId: string): MatchDetail {
  return {
    ...EMPTY_MATCH_DETAIL(matchId),
    events: [
      {
        id: 'evt-1',
        minute: 23,
        period: 'FIRST_HALF',
        kind: 'goal',
        side: 'home',
        playerId: 'p-mbappe',
        playerName: 'Mbappé',
      },
    ],
  };
}

beforeEach(() => {
  fetchFifaMatchDetailMock.mockReset();
  mapFifaMatchDetailMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadMatchDetail — unavailable (null providerRef)', () => {
  it('resolves { kind: "unavailable" } for a mock match (no providerRef)', async () => {
    const outcome = await loadMatchDetail(MOCK_MATCH);
    expect(outcome).toEqual({ kind: 'unavailable' });
  });

  it('does NOT fetch FIFA when the providerRef is null', async () => {
    await loadMatchDetail(MOCK_MATCH);
    expect(fetchFifaMatchDetailMock).not.toHaveBeenCalled();
  });

  it('carries no user-facing copy in the unavailable outcome (Review M-B)', async () => {
    // The empty-state text is UI-owned (PanelEmpty); the loader returns a bare
    // discriminant only — no message/title key.
    const outcome = await loadMatchDetail(MOCK_MATCH);
    expect(Object.keys(outcome)).toEqual(['kind']);
  });
});

describe('loadMatchDetail — ready (FIFA reachable)', () => {
  it('resolves { kind: "ready", detail } for a FIFA-ref match', async () => {
    const detail = EMPTY_MATCH_DETAIL(FIFA_REF.idMatch);
    fetchFifaMatchDetailMock.mockResolvedValue({ live: { x: 1 }, timeline: { y: 2 } });
    mapFifaMatchDetailMock.mockReturnValue(detail);

    const outcome = await loadMatchDetail(FIFA_MATCH);

    expect(outcome).toEqual({ kind: 'ready', detail });
  });

  it('keys the mapped detail by the providerRef idMatch', async () => {
    const detail: MatchDetail = EMPTY_MATCH_DETAIL(FIFA_REF.idMatch);
    fetchFifaMatchDetailMock.mockResolvedValue({ live: null, timeline: null });
    mapFifaMatchDetailMock.mockReturnValue(detail);

    const outcome = await loadMatchDetail(FIFA_MATCH);

    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.detail.matchId).toBe(FIFA_REF.idMatch);
    }
  });

  it('passes the resolved providerRef through to the FIFA detail fetch', async () => {
    fetchFifaMatchDetailMock.mockResolvedValue({ live: null, timeline: null });
    mapFifaMatchDetailMock.mockReturnValue(EMPTY_MATCH_DETAIL(FIFA_REF.idMatch));

    await loadMatchDetail(FIFA_MATCH);

    expect(fetchFifaMatchDetailMock).toHaveBeenCalledWith(FIFA_REF, expect.anything());
  });

  it('feeds the fetched live + timeline sections and ref into the mapper (orchestration wiring)', async () => {
    // The loader is pure orchestration: it unpacks { live, timeline } from the
    // FIFA client and calls mapFifaMatchDetail(live, timeline, ref) — the same
    // 3-arg contract the deleted Hono route used (match-detail.ts:42). Pins the
    // seam between fetch and map so the mapper owns the FIFA→domain shape.
    const live = { IdMatch: FIFA_REF.idMatch };
    const timeline = { Event: [] };
    fetchFifaMatchDetailMock.mockResolvedValue({ live, timeline });
    mapFifaMatchDetailMock.mockReturnValue(EMPTY_MATCH_DETAIL(FIFA_REF.idMatch));

    await loadMatchDetail(FIFA_MATCH);

    expect(mapFifaMatchDetailMock).toHaveBeenCalledTimes(1);
    expect(mapFifaMatchDetailMock).toHaveBeenCalledWith(live, timeline, FIFA_REF);
  });

  it('returns a populated MatchDetail (events preserved) on the full happy path', async () => {
    // Distinct from the both-null degrade case: when the mapper yields a
    // non-empty detail, the loader passes it through verbatim — it neither empties
    // nor reshapes a populated result.
    const detail = populatedDetail(FIFA_REF.idMatch);
    fetchFifaMatchDetailMock.mockResolvedValue({
      live: { IdMatch: FIFA_REF.idMatch },
      timeline: { Event: [{ Type: 0 }] },
    });
    mapFifaMatchDetailMock.mockReturnValue(detail);

    const outcome = await loadMatchDetail(FIFA_MATCH);

    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.detail.matchId).toBe(FIFA_REF.idMatch);
      expect(outcome.detail.events).toHaveLength(1);
      expect(outcome.detail.events[0]?.playerName).toBe('Mbappé');
    }
  });

  it('degrades both-null sections to a "ready" EMPTY_MATCH_DETAIL-shaped detail (mapper degrade, no throw)', async () => {
    // Both sections null but NO throw → the mapper degrades to an empty-but-valid
    // MatchDetail and the loader reports "ready" (not "unavailable", not "error").
    fetchFifaMatchDetailMock.mockResolvedValue({ live: null, timeline: null });
    mapFifaMatchDetailMock.mockReturnValue(EMPTY_MATCH_DETAIL(FIFA_REF.idMatch));

    const outcome = await loadMatchDetail(FIFA_MATCH);

    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.detail.events).toEqual([]);
      expect(outcome.detail.home.starters).toEqual([]);
      expect(outcome.detail.winProbability).toBeNull();
    }
  });
});

describe('loadMatchDetail — propagates genuine upstream throws (does not swallow)', () => {
  // FIDELITY NOTE (Review M2): at runtime `fetchFifaMatchDetail` CANNOT throw —
  // its internal `fetchSection` (match-detail-client.ts:57) swallows every error
  // (HTTP / 429 / abort-timeout / oversized / invalid-JSON / schema) to `null`,
  // and `Promise.all` over two never-rejecting sections always resolves. So the
  // ONLY real thrower the loader composes is `mapFifaMatchDetail` (the FIFA→domain
  // mapper, which surfaces a `ValidationError` on a shape it cannot map). These
  // cases therefore drive the throw through the mapper — the reachable runtime
  // path that produces the hook's `status: 'error'`. The deleted Hono route had
  // the same degrade-per-section design, so this is faithful, not a regression.
  it('lets a ValidationError from the mapper propagate (reachable runtime path)', async () => {
    fetchFifaMatchDetailMock.mockResolvedValue({ live: { x: 1 }, timeline: { y: 2 } });
    mapFifaMatchDetailMock.mockImplementation(() => {
      throw new ValidationError('FIFA detail payload failed validation');
    });
    await expect(loadMatchDetail(FIFA_MATCH)).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
  });

  it('does not convert a thrown mapper error into an "unavailable" outcome', async () => {
    fetchFifaMatchDetailMock.mockResolvedValue({ live: { x: 1 }, timeline: { y: 2 } });
    mapFifaMatchDetailMock.mockImplementation(() => {
      throw new ValidationError('bad shape');
    });
    await expect(loadMatchDetail(FIFA_MATCH)).rejects.toThrow();
  });

  // Defensive: even though `fetchFifaMatchDetail` cannot throw today, the loader
  // does not catch — so IF the fetch layer ever started propagating (e.g. a
  // future change drops the per-section swallow), the error would still surface
  // to the hook's `error` branch rather than be silently dropped. Pins that the
  // loader adds no try/catch of its own.
  it('does not swallow a rejection from the fetch layer either (no loader-level catch)', async () => {
    fetchFifaMatchDetailMock.mockRejectedValue(new RateLimitError('Upstream rate limit reached'));
    await expect(loadMatchDetail(FIFA_MATCH)).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe('loadMatchDetail — AbortSignal threading', () => {
  it('forwards a provided AbortSignal to the FIFA detail fetch', async () => {
    fetchFifaMatchDetailMock.mockResolvedValue({ live: null, timeline: null });
    mapFifaMatchDetailMock.mockReturnValue(EMPTY_MATCH_DETAIL(FIFA_REF.idMatch));
    const controller = new AbortController();

    await loadMatchDetail(FIFA_MATCH, { signal: controller.signal });

    expect(fetchFifaMatchDetailMock).toHaveBeenCalledWith(
      FIFA_REF,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
