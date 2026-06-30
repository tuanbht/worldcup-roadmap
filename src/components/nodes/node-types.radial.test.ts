// Registry contract for the radial circle node types (requirement
// 2026-06-30-1104; plan Test Strategy 26 / Acceptance #1). The circle view adds
// three React Flow node types — `team-badge`, `match-dot`, `final-center` —
// alongside the existing grid three, so build-radial-graph's nodes resolve to
// their renderers. Pure object inspection — no DOM.
//
// RED until node-types.ts registers the three new types bound to their
// components. (The existing node-types.test.ts pins the grid three; the GREEN
// stage widens that exhaustive set — this file only asserts the ADDITIONS.)
import { describe, expect, it } from 'vitest';
import { nodeTypes } from './node-types';
import { TeamBadgeNode } from './TeamBadgeNode';
import { MatchDotNode } from './MatchDotNode';
import { FinalCenterNode } from './FinalCenterNode';

describe('nodeTypes registry — radial circle nodes [Test 26 / Acceptance #1]', () => {
  it('registers the team-badge node type bound to TeamBadgeNode', () => {
    expect('team-badge' in nodeTypes).toBe(true);
    expect(nodeTypes['team-badge']).toBe(TeamBadgeNode);
  });

  it('registers the match-dot node type bound to MatchDotNode', () => {
    expect('match-dot' in nodeTypes).toBe(true);
    expect(nodeTypes['match-dot']).toBe(MatchDotNode);
  });

  it('registers the final-center node type bound to FinalCenterNode', () => {
    expect('final-center' in nodeTypes).toBe(true);
    expect(nodeTypes['final-center']).toBe(FinalCenterNode);
  });

  it('keeps the existing grid node types alongside the radial ones (no regression)', () => {
    expect('match' in nodeTypes).toBe(true);
    expect('day-marker' in nodeTypes).toBe(true);
    expect('group-standings' in nodeTypes).toBe(true);
  });
});
