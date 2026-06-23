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

  it('registers exactly the three surviving node types and no others', () => {
    // The registry is the single source of truth for what React Flow can mount;
    // assert the WHOLE key set so a re-added pill (or a stray type) is caught.
    expect(Object.keys(nodeTypes).sort()).toEqual(['day-marker', 'group-standings', 'match']);
  });
});
