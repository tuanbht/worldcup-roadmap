import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Team, Tournament } from '@/domain/types';

export interface FocusedTeam {
  /** Resolved focused team id, or null when nothing is focused. */
  readonly teamId: string | null;
  /** The focused team's FIFA code (for the `?team=` param / announcements). */
  readonly teamCode: string | null;
  /** Set/toggle the focused team by id; re-selecting the same id clears it. */
  setFocusedTeam: (idOrNull: string | null) => void;
  /** Clear the focused team (removes `?team=`). */
  clear: () => void;
}

/** Read the `?team=` param, or null when absent / SSR. */
function readTeamParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('team');
}

/**
 * Write or remove ONLY the `?team=` param on a FRESH URL (so a co-existing
 * `?focus=` written by `useStageView` is preserved), mirroring useStageView's
 * `history.replaceState` persistence.
 */
function writeTeamParam(code: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('team', code);
  else url.searchParams.delete('team');
  window.history.replaceState(null, '', url);
}

/**
 * `?team=CODE` URL-state store behind the team-focus feature (item 3). Mirrors
 * `useStageView`'s client-only hydrate pattern: it hydrates `teamId` from
 * `?team=CODE` after mount (and again when `teams` arrive from the async query),
 * resolving the FIFA code to the team id; `setFocusedTeam` writes/removes the
 * param and toggles off on re-select; `clear` removes it. An unknown/garbage code
 * yields no focus and never throws.
 */
export function useFocusedTeam(tournament: Tournament | null): FocusedTeam {
  const [teamId, setTeamId] = useState<string | null>(null);

  const teams = tournament?.teams ?? null;

  const byCode = useMemo(() => {
    const map = new Map<string, Team>();
    for (const team of teams ?? []) if (team.code) map.set(team.code, team);
    return map;
  }, [teams]);

  const byId = useMemo(() => {
    const map = new Map<string, Team>();
    for (const team of teams ?? []) map.set(team.id, team);
    return map;
  }, [teams]);

  // Hydrate from the URL after mount AND whenever the teams arrive (the async
  // query is null on first paint, so the `?team=` value can only resolve once the
  // roster lands). The param is a FIFA code when the team has one, else the id
  // fallback — so resolve by code first, then by id.
  useEffect(() => {
    const param = readTeamParam();
    if (!param) {
      setTeamId(null);
      return;
    }
    const resolved = byCode.get(param) ?? byId.get(param) ?? null;
    setTeamId(resolved?.id ?? null);
  }, [byCode, byId]);

  const setFocusedTeam = useCallback(
    (idOrNull: string | null) => {
      setTeamId((current) => {
        // Clear on null / re-select. An unknown id (absent from the roster) is a
        // no-op so we never write a dangling param we cannot describe.
        if (idOrNull === null || idOrNull === current) {
          writeTeamParam(null);
          return null;
        }
        const team = byId.get(idOrNull);
        if (!team) return current;
        writeTeamParam(team.code ?? team.id);
        return idOrNull;
      });
    },
    [byId],
  );

  const clear = useCallback(() => {
    setTeamId(null);
    writeTeamParam(null);
  }, []);

  const teamCode = teamId ? (byId.get(teamId)?.code ?? null) : null;

  return { teamId, teamCode, setFocusedTeam, clear };
}
