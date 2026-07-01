// Registry contract for the React Flow node-type map after the group-header pill
// removal (Acceptance #1, #2). The deleted pill must be gone from the registry,
// while the always-on `group-standings` table (the single per-column header)
// stays. Pure object inspection — no DOM. RED until node-types.ts drops the
// `'group-header'` entry + import.
import { describe, expect, it } from 'vitest';
import { nodeTypes } from './node-types';

describe('nodeTypes registry — group-header removed [Acceptance #1, #2]', () => {
  it('no longer registers a "group-header" node type', () => {
    expect('group-header' in nodeTypes).toBe(false);
  });

  it('keeps the always-on group-standings table as the per-column header', () => {
    expect('group-standings' in nodeTypes).toBe(true);
    expect(nodeTypes['group-standings']).toBeDefined();
  });

  it('still registers the match + day-marker node types', () => {
    expect('match' in nodeTypes).toBe(true);
    expect('day-marker' in nodeTypes).toBe(true);
    expect(nodeTypes.match).toBeDefined();
    expect(nodeTypes['day-marker']).toBeDefined();
  });

  it('registers exactly the grid + radial + matrix node types and no others', () => {
    // The registry is the single source of truth for what React Flow can mount;
    // assert the WHOLE key set so a re-added pill (or a stray type) is caught. The
    // radial circle view (2026-06-30-1104) ADDS the three radial node types, and
    // the matrix journey-lanes view (2026-07-01-1030) ADDS `matrix-match`,
    // alongside the surviving grid three; only the active layout mounts.
    expect(Object.keys(nodeTypes).sort()).toEqual([
      'day-marker',
      'final-center',
      'group-standings',
      'match',
      'match-dot',
      'matrix-match',
      'team-badge',
    ]);
  });
});
