import { env } from './config/env';
import type { MatchRepository } from './repository';
import { FifaRepository } from './providers/fifa/fifa-repository';
import { MockRepository } from './providers/mock/mock-repository';

/**
 * Pick the active repository from configuration.
 *  - `mock` — always the offline fixture.
 *  - `fifa` — strictly the FIFA API (errors surface to the caller).
 *  - `auto` (default) — FIFA with a transparent mock fallback, so the app works
 *    with zero config and survives FIFA outages/rate limits.
 */
export function selectRepository(): MatchRepository {
  switch (env.WC_PROVIDER) {
    case 'mock':
      return new MockRepository();
    case 'fifa':
      return new FifaRepository();
    case 'auto':
    default:
      return new FifaRepository(new MockRepository());
  }
}
