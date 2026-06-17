'use client';

/**
 * Reads the live React Flow zoom and derives the current LOD band.
 *
 * Subscribes to the internal transform (`s.transform[2]` is the zoom factor) and
 * tracks the previous band in a ref so `zoomToLod` can apply hysteresis and the
 * band never flickers at a threshold. Returns `{ zoom, lod }`. Must be called
 * inside a <ReactFlowProvider>.
 */
import { useRef } from 'react';
import { useStore } from '@xyflow/react';
import { zoomToLod, type Lod } from '../lod';

export function useZoomLevel(): { zoom: number; lod: Lod } {
  const zoom = useStore((s) => s.transform[2]);
  const prevRef = useRef<Lod | undefined>(undefined);

  const lod = zoomToLod(zoom, prevRef.current);
  prevRef.current = lod;

  return { zoom, lod };
}
