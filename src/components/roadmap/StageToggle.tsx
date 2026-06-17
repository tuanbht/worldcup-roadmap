import { Panel } from '@xyflow/react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { RoadmapFocus } from '@/features/roadmap/graph-model';

const OPTIONS: ReadonlyArray<{ value: RoadmapFocus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'groups', label: 'Groups' },
  { value: 'knockout', label: 'Knockout' },
];

interface StageToggleProps {
  focus: RoadmapFocus;
  onChange: (focus: RoadmapFocus) => void;
}

/**
 * Focus control for the continuous canvas. Selecting a phase moves the camera
 * (handled by the canvas) — it never swaps layouts; the continuous canvas is the
 * single, default view.
 */
export function StageToggle({ focus, onChange }: StageToggleProps) {
  return (
    <Panel position="top-left" className="stage-toggle">
      <SegmentedControl
        options={OPTIONS}
        value={focus}
        onChange={onChange}
        ariaLabel="Focus the roadmap on a phase"
      />
    </Panel>
  );
}
