// Registry contract for the React Flow edge-type map after adding the matrix lane
// edge (requirement 2026-07-01-1030; plan Test Strategy 13 / Acceptance #7). The
// `matrix-lane` type must be registered so build-matrix-graph's `type:'matrix-lane'`
// edges resolve to the MatrixLaneEdge renderer. Pure object inspection — no DOM.
// RED until `edge-types.ts` registers `'matrix-lane': MatrixLaneEdge`.
import { describe, expect, it } from 'vitest';
import { edgeTypes } from './edge-types';
import { MatrixLaneEdge } from './MatrixLaneEdge';

describe('edgeTypes registry — matrix lane [Acceptance #7]', () => {
  it('registers the "matrix-lane" edge type bound to the MatrixLaneEdge renderer', () => {
    // RED: edge-types.ts has not registered matrix-lane yet → key absent.
    expect('matrix-lane' in edgeTypes).toBe(true);
    expect(edgeTypes['matrix-lane']).toBe(MatrixLaneEdge);
  });

  it('keeps the existing advance/member/radial edge types (no regression)', () => {
    for (const key of ['advance', 'member', 'radial']) {
      expect(key in edgeTypes, `existing edge type ${key} preserved`).toBe(true);
      expect(edgeTypes[key]).toBeDefined();
    }
  });

  it('registers exactly the grid + radial + matrix edge types and no others', () => {
    expect(Object.keys(edgeTypes).sort()).toEqual(['advance', 'matrix-lane', 'member', 'radial']);
  });
});
