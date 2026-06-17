import { Panel } from '@xyflow/react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { RoadmapView } from '@/features/roadmap/graph-model';

const OPTIONS: ReadonlyArray<{ value: RoadmapView; label: string }> = [
  { value: 'groups', label: 'Groups' },
  { value: 'bracket', label: 'Bracket' },
  { value: 'full', label: 'Full roadmap' },
];

interface StageToggleProps {
  view: RoadmapView;
  onChange: (view: RoadmapView) => void;
}

export function StageToggle({ view, onChange }: StageToggleProps) {
  return (
    <Panel position="top-left" className="stage-toggle">
      <SegmentedControl
        options={OPTIONS}
        value={view}
        onChange={onChange}
        ariaLabel="Select roadmap view"
      />
    </Panel>
  );
}
