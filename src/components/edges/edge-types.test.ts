// Registry contract for the React Flow edge-type map after adding the dashed
// membership edge (Acceptance #8). The `member` type must be registered
// alongside the existing `advance` type so build-graph's `type:'member'` edges
// resolve to the MemberEdge renderer. Pure object inspection — no DOM. RED until
// edge-types.ts registers `member: MemberEdge`.
import { describe, expect, it } from 'vitest';
import { edgeTypes } from './edge-types';
import { MemberEdge } from './MemberEdge';
import { AdvanceEdge } from './AdvanceEdge';

describe('edgeTypes registry — membership edge [Acceptance #8]', () => {
  it('registers the "member" edge type bound to the MemberEdge renderer', () => {
    expect('member' in edgeTypes).toBe(true);
    expect(edgeTypes.member).toBe(MemberEdge);
  });

  it('keeps the existing "advance" edge type bound to AdvanceEdge (no regression)', () => {
    // Adding `member` must not perturb the advance registration the AdvanceEdge
    // contract relies on — assert the exact binding, not just key presence.
    expect('advance' in edgeTypes).toBe(true);
    expect(edgeTypes.advance).toBe(AdvanceEdge);
  });

  it('registers no stray edge types beyond advance + member', () => {
    expect(Object.keys(edgeTypes).sort()).toEqual(['advance', 'member']);
  });
});
