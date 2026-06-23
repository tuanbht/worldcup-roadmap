import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { DayMarkerFlowNode } from '@/features/roadmap/graph-model';
import { DAY_MARKER_H, DAY_MARKER_INSET, RAIL_W } from '@/features/roadmap/layout/layout-constants';

/**
 * Left date-rail guide: a single calendar day's label (e.g. "11 Jun"). The node
 * spans the rail width and RIGHT-ALIGNS its pill (with a DAY_MARKER_INSET gap) so
 * it always sits left of the column-0 cards, which start at x = RAIL_W, instead
 * of spilling over them.
 *
 * Item 1 (alignment): the node's top-left y matches the cards' top-left y, but a
 * card is `DAY_MARKER_H` (= NODE_H) tall while the pill is ~28px, so a top-
 * anchored pill would land ~40px ABOVE the card centerline. Wrapping the pill in a
 * `DAY_MARKER_H`-tall flex box and vertically centering it (`items-center`) puts
 * the pill on `rowY + NODE_H/2` — the card centerline — with no change to the
 * pure build-graph y math.
 *
 * Semantic `<time>`, design tokens, NO React Flow handles (a guide, not an edge
 * endpoint). `[contain:layout_paint]` off the hot path.
 */
function DayMarkerNodeImpl({ data }: NodeProps<DayMarkerFlowNode>) {
  return (
    <div
      className="flex items-center justify-end"
      style={{ width: RAIL_W, height: DAY_MARKER_H, paddingRight: DAY_MARKER_INSET }}
    >
      <time
        dateTime={data.dayKey}
        className="text-dim border-edge bg-surf-1/70 rounded-md border px-2 py-1 text-[0.72rem] font-semibold tracking-[0.06em] uppercase tabular-nums backdrop-blur [contain:layout_paint]"
      >
        {data.dayLabel}
      </time>
    </div>
  );
}

export const DayMarkerNode = memo(DayMarkerNodeImpl);
