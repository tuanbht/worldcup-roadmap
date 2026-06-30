// Registry contract for the radial circle edge type (requirement
// 2026-06-30-1104; plan Test Strategy 26 / Acceptance #3). The circle view adds
// one React Flow edge type — `radial` — alongside the existing `advance` +
// `member`, so build-radial-graph's `type:'radial'` edges resolve to RadialEdge.
// Pure object inspection — no DOM.
//
// RED until edge-types.ts registers `radial: RadialEdge`. (The existing
// edge-types.test.ts pins the exhaustive advance+member set; the GREEN stage
// widens it — this file only asserts the ADDITION.)
import { describe, expect, it } from 'vitest';
import { edgeTypes } from './edge-types';
import { RadialEdge } from './RadialEdge';
import { AdvanceEdge } from './AdvanceEdge';
import { MemberEdge } from './MemberEdge';

describe('edgeTypes registry — radial edge [Test 26 / Acceptance #3]', () => {
  it('registers the "radial" edge type bound to the RadialEdge renderer', () => {
    expect('radial' in edgeTypes).toBe(true);
    expect(edgeTypes.radial).toBe(RadialEdge);
  });

  it('keeps the existing advance + member edge types (no regression)', () => {
    expect(edgeTypes.advance).toBe(AdvanceEdge);
    expect(edgeTypes.member).toBe(MemberEdge);
  });
});
