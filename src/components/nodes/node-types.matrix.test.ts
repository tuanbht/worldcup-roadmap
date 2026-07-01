// Registry contract for the React Flow node-type map after adding the matrix
// station node (requirement 2026-07-01-1030; plan Test Strategy 13 / Acceptance
// #7). The `matrix-match` type must be registered so build-matrix-graph's
// `type:'matrix-match'` stations resolve to the MatrixMatchNode renderer. Pure
// object inspection — no DOM. RED until `node-types.ts` registers
// `'matrix-match': MatrixMatchNode`.
import { describe, expect, it } from 'vitest';
import { nodeTypes } from './node-types';
import { MatrixMatchNode } from './MatrixMatchNode';

describe('nodeTypes registry — matrix station [Acceptance #7]', () => {
  it('registers the "matrix-match" node type bound to the MatrixMatchNode renderer', () => {
    // RED: node-types.ts has not registered matrix-match yet → key absent.
    expect('matrix-match' in nodeTypes).toBe(true);
    expect(nodeTypes['matrix-match']).toBe(MatrixMatchNode);
  });

  it('keeps the existing grid + radial node types (no regression)', () => {
    // Adding matrix-match must not perturb the six existing bindings.
    for (const key of [
      'match',
      'day-marker',
      'group-standings',
      'team-badge',
      'match-dot',
      'final-center',
    ]) {
      expect(key in nodeTypes, `existing node type ${key} preserved`).toBe(true);
      expect(nodeTypes[key]).toBeDefined();
    }
  });

  it('registers exactly the grid + radial + matrix node types and no others', () => {
    // The exhaustive key set now includes matrix-match (kept in sync with
    // node-types.test.ts, which the GREEN registry edit must widen together).
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
