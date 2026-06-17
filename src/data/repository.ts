import type { Tournament } from '@/domain/types';

/**
 * The single seam every provider implements and the route depends on. Concrete
 * repositories (FIFA, mock, …) all return the same normalized `Tournament`.
 */
export interface MatchRepository {
  readonly name: string;
  getTournament(): Promise<Tournament>;
}
