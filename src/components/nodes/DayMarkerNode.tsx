import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { DayMarkerFlowNode } from '@/features/roadmap/graph-model';

/**
 * Left date-rail guide: a single calendar day's label (e.g. "11 Jun"). Semantic
 * `<time>`, design tokens, NO React Flow handles (it is a guide, not an edge
 * endpoint). `[contain:layout_paint]` keeps it off the compositor's hot path.
 */
function DayMarkerNodeImpl({ data }: NodeProps<DayMarkerFlowNode>) {
  return (
    <time
      dateTime={data.dayKey}
      className="text-dim border-edge bg-surf-1/70 block rounded-md border px-2 py-1 text-right text-[0.72rem] font-semibold tracking-[0.06em] uppercase tabular-nums backdrop-blur [contain:layout_paint]"
    >
      {data.dayLabel}
    </time>
  );
}

export const DayMarkerNode = memo(DayMarkerNodeImpl);
