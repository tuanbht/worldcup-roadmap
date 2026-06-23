// @vitest-environment jsdom
//
// Hook spec for `useFocusedTeam` — the `?team=CODE` URL-state store behind the
// team-focus feature (requirement item 3; plan Test Strategy 13 / Acceptance #6).
//
// The hook mirrors useStageView's client-only hydrate pattern:
//   - default to no focus on a clean URL,
//   - hydrate `teamId` from `?team=CODE` after mount (resolving CODE -> id),
//   - `setFocusedTeam(id)` writes `?team=CODE` and toggles OFF on re-select,
//   - `clear()` removes the param,
//   - tolerate an unknown/garbage `?team=` value (no focus, never throws).
//
// The URL is driven via jsdom's history API; we assert the `?team=` param round-
// trips. A tiny fixture tournament with two coded teams keeps the code<->id
// resolution deterministic without loading the full mock.
//
// RED until useFocusedTeam.ts is implemented (today the stub throws), so each
// assertion fails as "not implemented" rather than a typo/import error.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Team, Tournament } from '@/domain/types';
import { useFocusedTeam } from './useFocusedTeam';

const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
const FRA: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

/** A team whose FIFA code is null — the `?team=` param must fall back to the id. */
const NOC: Team = { id: 'team-noc', name: 'No-Code Land', code: null, flagUrl: null };

/** Minimal tournament factory: just enough teams for code<->id resolution. */
function makeTournament(teams: readonly Team[] = [ARG, FRA]): Tournament {
  return {
    meta: { id: 'WC-2026', name: 'WC', season: 2026, provider: 'mock', fetchedAt: '' },
    teams,
    matches: [],
    groups: [],
    bracket: { rounds: [] },
  } as unknown as Tournament;
}

const tournament = makeTournament();

/** Set the URL search to `search` (e.g. '?team=ARG') before mounting. */
function setSearch(search: string): void {
  window.history.replaceState(null, '', `${window.location.pathname}${search}`);
}

function currentTeamParam(): string | null {
  return new URLSearchParams(window.location.search).get('team');
}

/** Mount the hook and wait until it has settled to "no focus" (the clean-URL start),
 *  the shared Arrange step for every set/clear/toggle behaviour test. */
async function mountClean(t: Tournament = tournament) {
  const view = renderHook(() => useFocusedTeam(t));
  await waitFor(() => expect(view.result.current.teamId).toBeNull());
  return view;
}

beforeEach(() => setSearch(''));
afterEach(() => setSearch(''));

describe('useFocusedTeam — default (clean URL)', () => {
  it('starts with no focused team', async () => {
    const { result } = renderHook(() => useFocusedTeam(tournament));
    await waitFor(() => expect(result.current.teamId).toBeNull());
    expect(result.current.teamCode).toBeNull();
    expect(currentTeamParam()).toBeNull();
  });
});

describe('useFocusedTeam — hydrate from ?team=CODE', () => {
  it('resolves a ?team=ARG param to the team id after mount', async () => {
    setSearch('?team=ARG');
    const { result } = renderHook(() => useFocusedTeam(tournament));
    await waitFor(() => expect(result.current.teamId).toBe('team-arg'));
    expect(result.current.teamCode).toBe('ARG');
  });

  it('ignores an unknown/garbage ?team= value (no focus, no throw)', async () => {
    setSearch('?team=ZZZ');
    const { result } = renderHook(() => useFocusedTeam(tournament));
    await waitFor(() => expect(result.current.teamId).toBeNull());
  });

  it('tolerates a null tournament (provider still loading) without throwing', async () => {
    // The canvas mounts the hook before the tournament query resolves, so a null
    // tournament must yield no focus rather than crash the page.
    setSearch('?team=ARG');
    const { result } = renderHook(() => useFocusedTeam(null));
    await waitFor(() => expect(result.current.teamId).toBeNull());
    expect(result.current.teamCode).toBeNull();
  });
});

describe('useFocusedTeam — setFocusedTeam writes the URL', () => {
  it('writes ?team=ARG when a team is focused', async () => {
    const { result } = await mountClean();

    act(() => result.current.setFocusedTeam('team-arg'));

    expect(result.current.teamId).toBe('team-arg');
    expect(result.current.teamCode).toBe('ARG');
    expect(currentTeamParam()).toBe('ARG');
  });

  it('falls back to the team id in ?team= when the team has no FIFA code', async () => {
    // NOC has code:null; the param must round-trip a stable value (the id) so the
    // focus still persists/shares via the URL rather than writing "?team=null".
    const { result } = await mountClean(makeTournament([ARG, NOC]));

    act(() => result.current.setFocusedTeam('team-noc'));

    expect(result.current.teamId).toBe('team-noc');
    expect(currentTeamParam()).toBe('team-noc');
    expect(currentTeamParam()).not.toBe('null');
  });

  it('toggles OFF (clears) when the SAME team is re-selected', async () => {
    const { result } = await mountClean();

    act(() => result.current.setFocusedTeam('team-arg'));
    act(() => result.current.setFocusedTeam('team-arg')); // re-click same flag

    expect(result.current.teamId).toBeNull();
    expect(currentTeamParam()).toBeNull();
  });

  it('switches focus to a different team (replaces, not stacks)', async () => {
    const { result } = await mountClean();

    act(() => result.current.setFocusedTeam('team-arg'));
    act(() => result.current.setFocusedTeam('team-fra'));

    expect(result.current.teamId).toBe('team-fra');
    expect(currentTeamParam()).toBe('FRA');
  });

  it('re-focuses a team after switching away then back (toggle state stays per-team)', async () => {
    // Guards against a stale "last selected" toggle: ARG -> FRA -> ARG must end
    // focused on ARG, not toggle ARG off because it was the first selection.
    const { result } = await mountClean();

    act(() => result.current.setFocusedTeam('team-arg'));
    act(() => result.current.setFocusedTeam('team-fra'));
    act(() => result.current.setFocusedTeam('team-arg'));

    expect(result.current.teamId).toBe('team-arg');
    expect(currentTeamParam()).toBe('ARG');
  });
});

describe('useFocusedTeam — clear()', () => {
  it('removes the ?team= param and clears the focus', async () => {
    setSearch('?team=ARG');
    const { result } = renderHook(() => useFocusedTeam(tournament));
    await waitFor(() => expect(result.current.teamId).toBe('team-arg'));

    act(() => result.current.clear());

    expect(result.current.teamId).toBeNull();
    expect(currentTeamParam()).toBeNull();
  });
});

describe('useFocusedTeam — stable identities', () => {
  it('keeps setFocusedTeam / clear stable across re-renders', async () => {
    const { result, rerender } = await mountClean();
    const set = result.current.setFocusedTeam;
    const clr = result.current.clear;
    rerender();
    expect(result.current.setFocusedTeam).toBe(set);
    expect(result.current.clear).toBe(clr);
  });
});
