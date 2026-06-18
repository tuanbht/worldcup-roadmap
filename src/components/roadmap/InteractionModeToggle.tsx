import { Panel } from '@xyflow/react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { InteractionMode } from '@/features/roadmap/interaction-mode';

const OPTIONS: ReadonlyArray<{ value: InteractionMode; label: string }> = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'pan', label: 'Pan' },
];

const HINTS: Record<InteractionMode, string> = {
  zoom: 'Scroll to zoom',
  pan: 'Scroll to pan · ⌘-scroll to zoom',
};

interface InteractionModeToggleProps {
  mode: InteractionMode;
  onChange: (mode: InteractionMode) => void;
}

/**
 * Canvas scroll-behaviour toggle. Switches the wheel/scroll affordance between
 * 'zoom' (plain wheel zooms cursor-centered, drag pans — the default, honoring
 * the zoomable-roadmap-graph hard requirement) and 'pan' (two-finger / plain
 * scroll pans; ⌘/Ctrl+scroll and pinch zoom). The active affordance is described
 * in a short hint line so users know how to zoom in the current mode.
 *
 * Keyboard + ARIA come from the reused accessible `SegmentedControl` (tablist of
 * tabs); the hint is exposed to assistive tech via `aria-describedby`.
 */
export function InteractionModeToggle({ mode, onChange }: InteractionModeToggleProps) {
  const hintId = 'interaction-mode-hint';
  return (
    <Panel position="bottom-center" className="interaction-mode-toggle">
      <div className="flex flex-col items-center gap-1.5">
        <div aria-describedby={hintId}>
          <SegmentedControl
            options={OPTIONS}
            value={mode}
            onChange={onChange}
            ariaLabel="Canvas scroll behavior"
          />
        </div>
        <p id={hintId} className="text-dim text-[0.7rem] tracking-wide">
          {HINTS[mode]}
        </p>
      </div>
    </Panel>
  );
}
