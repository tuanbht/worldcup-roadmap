import type { Tournament } from '@/domain/types';
import { parseTournament } from '@/data/schema/tournament-schema';
import type { MatchRepository } from '@/data/repository';
import { buildMockTournament } from './build-mock-tournament';

/**
 * Offline provider. Builds the deterministic mock snapshot and validates it
 * through the domain schema, so the fixture can never silently drift from the
 * types. Requires no network or API key — the zero-config default.
 */
export class MockRepository implements MatchRepository {
  readonly name = 'mock';

  async getTournament(): Promise<Tournament> {
    const built = buildMockTournament(new Date().toISOString());
    return parseTournament(built);
  }
}
