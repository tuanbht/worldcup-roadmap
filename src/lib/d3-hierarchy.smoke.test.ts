// Smoke test (node). Proves `d3-hierarchy` + `@types/d3-hierarchy` install and
// type-resolve in the Vite/Vitest build so the next phase (req #2, bracket
// layout) starts on a known-good base. It is NOT a bracket-reconstruction test —
// that lives in req #2; here we only exercise the package's own `hierarchy()`
// API on a throwaway inline datum.
import { describe, expect, it } from 'vitest';
import { hierarchy, type HierarchyNode } from 'd3-hierarchy';

interface TinyNode {
  readonly id: string;
  readonly children?: readonly TinyNode[];
}

/** A binary tree of depth 2: one root, two internal nodes, four leaves. */
const TINY_TREE: TinyNode = {
  id: 'root',
  children: [
    { id: 'a', children: [{ id: 'a1' }, { id: 'a2' }] },
    { id: 'b', children: [{ id: 'b1' }, { id: 'b2' }] },
  ],
};

// Build a fresh node per test so no `it` block shares mutable traversal state
// with another (count/sum/each annotate the node in place).
function buildRoot(): HierarchyNode<TinyNode> {
  return hierarchy<TinyNode>(TINY_TREE, (n) => n.children);
}

describe('d3-hierarchy install smoke test', () => {
  it('counts the four leaves of the tiny tree', () => {
    expect(buildRoot().leaves()).toHaveLength(4);
  });

  it('reports a height of 2 for a depth-2 tree', () => {
    expect(buildRoot().height).toBe(2);
  });

  it('exposes the root datum through the typed accessor', () => {
    expect(buildRoot().data.id).toBe('root');
  });

  it('walks every descendant via .count() (7 nodes: root + 2 internal + 4 leaves)', () => {
    expect(buildRoot().descendants()).toHaveLength(7);
  });

  it('assigns each leaf a depth of 2 (the bracket-layout depth the next phase reads)', () => {
    const depths = buildRoot()
      .leaves()
      .map((leaf) => leaf.depth);
    expect(depths).toEqual([2, 2, 2, 2]);
  });
});
