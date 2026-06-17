import { assembleTournament } from '@/domain/assemble-tournament';
import type { Tournament } from '@/domain/types';
import type { MatchRepository } from '@/data/repository';
import { ValidationError, getErrorMessage } from '@/data/errors';
import { fetchFifaMatches } from './client';
import { mapFifaMatches } from './mapper';

/**
 * Live provider backed by the official FIFA API. When a `fallback` repository is
 * supplied (the `auto` mode), any upstream failure — bot block, rate limit, bad
 * payload — transparently serves the fallback instead of erroring the request.
 */
export class FifaRepository implements MatchRepository {
  readonly name = 'fifa';

  constructor(private readonly fallback?: MatchRepository) {}

  async getTournament(): Promise<Tournament> {
    try {
      const raw = await fetchFifaMatches();
      const matches = mapFifaMatches(raw);
      if (matches.length === 0) {
        throw new ValidationError('FIFA API returned no matches for the configured season');
      }
      return assembleTournament({
        matches,
        provider: 'fifa',
        fetchedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      if (this.fallback) return this.fallback.getTournament();
      throw error instanceof Error ? error : new ValidationError(getErrorMessage(error));
    }
  }
}
