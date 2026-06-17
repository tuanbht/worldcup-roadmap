'use client';

import { useMemo } from 'react';
import type { Tournament } from '@/domain/types';
import { buildRoadmapGraph } from '../build-graph';
import type { RoadmapGraph, RoadmapView } from '../graph-model';

const EMPTY: RoadmapGraph = { nodes: [], edges: [] };

/** Memoized React Flow graph; recomputes only when the data or view changes. */
export function useRoadmapGraph(tournament: Tournament | null, view: RoadmapView): RoadmapGraph {
  return useMemo(() => (tournament ? buildRoadmapGraph(tournament, view) : EMPTY), [tournament, view]);
}
