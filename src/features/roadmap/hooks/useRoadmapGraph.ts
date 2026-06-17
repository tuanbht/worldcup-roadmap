import { useMemo } from 'react';
import type { Tournament } from '@/domain/types';
import { buildRoadmapGraph } from '../build-graph';
import type { RoadmapGraph } from '../graph-model';

const EMPTY: RoadmapGraph = { nodes: [], edges: [] };

/** Memoized continuous-canvas graph; recomputes only when the tournament changes. */
export function useRoadmapGraph(tournament: Tournament | null): RoadmapGraph {
  return useMemo(() => (tournament ? buildRoadmapGraph(tournament) : EMPTY), [tournament]);
}
