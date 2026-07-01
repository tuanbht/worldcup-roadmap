import { useMemo } from 'react';
import type { Tournament } from '@/domain/types';
import { buildRoadmapGraph } from '../build-graph';
import { buildRadialGraph } from '../build-radial-graph';
import { buildMatrixGraph } from '../build-matrix-graph';
import type { LayoutMode, RoadmapGraph } from '../graph-model';

const EMPTY: RoadmapGraph = { nodes: [], edges: [] };

/**
 * Memoized continuous-canvas graph; recomputes only when the tournament OR the
 * layout `mode` changes. `circle` dispatches to the radial knockout builder,
 * `matrix` to the subway journey-lanes builder; any other mode (the default
 * `grid`) keeps the byte-identical timeline-grid graph.
 */
export function useRoadmapGraph(
  tournament: Tournament | null,
  mode: LayoutMode = 'grid',
): RoadmapGraph {
  return useMemo(() => {
    if (!tournament) return EMPTY;
    if (mode === 'circle') return buildRadialGraph(tournament);
    if (mode === 'matrix') return buildMatrixGraph(tournament);
    return buildRoadmapGraph(tournament);
  }, [tournament, mode]);
}
