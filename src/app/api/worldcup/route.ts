import { getCachedTournament } from '@/data/cache/tournament-cache';
import { fail, ok } from '@/data/envelope';
import { toApiError } from '@/data/errors';
import { selectRepository } from '@/data/repository-factory';

// We manage caching ourselves (liveness-dependent TTL), so disable route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const repo = selectRepository();
    const tournament = await getCachedTournament(repo);
    return Response.json(ok(tournament), {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    const apiError = toApiError(error);
    return Response.json(fail(apiError.code, apiError.message), { status: apiError.http });
  }
}
