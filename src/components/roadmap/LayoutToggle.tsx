import { Panel } from '@xyflow/react';
import type { LayoutMode } from '@/features/roadmap/graph-model';

const OPTIONS: ReadonlyArray<{ value: LayoutMode; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'circle', label: 'Circle' },
];

interface LayoutToggleProps {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  /**
   * In grid mode the StageToggle keeps its original top-left position
   * (byte-identical grid snapshots), so the LayoutToggle is nudged BELOW it.
   * In circle mode the StageToggle is hidden, so the LayoutToggle sits at the top.
   */
  offset?: boolean;
}

/**
 * Layout-mode switch for the canvas: the default timeline `Grid` vs the radial
 * `Circle` knockout bracket. Unlike `StageToggle` (which only re-frames the
 * camera), selecting a mode swaps the whole graph SHAPE. Persisted to `?layout=`
 * by `useLayoutMode`. Sibling of `StageToggle`, top-left.
 *
 * Rendered as a plain `<button>` group (role `button`), NOT a `role="tablist"`
 * SegmentedControl: there is no corresponding `role="tabpanel"` for a layout mode
 * (the choice swaps the whole graph, not a panel), so a button group is the honest
 * a11y role — and matches the toggle's accessible-name contract.
 */
export function LayoutToggle({ mode, onChange, offset = false }: LayoutToggleProps) {
  return (
    // Inline marginTop (NOT a Tailwind class) so it reliably beats the React Flow
    // `.react-flow__panel { margin: 15px }` shorthand regardless of stylesheet
    // import order — otherwise the offset is clobbered and the two top-left pills
    // overlap (the StageToggle would intercept the Circle button's clicks).
    <Panel
      position="top-left"
      className="layout-toggle"
      style={offset ? { marginTop: 64 } : undefined}
    >
      <div
        role="group"
        aria-label="Switch the bracket layout"
        className="border-edge bg-surf-1/80 flex gap-1 rounded-full border p-1 backdrop-blur"
      >
        {OPTIONS.map((option) => {
          const active = option.value === mode;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors pointer-coarse:inline-flex pointer-coarse:min-h-[44px] pointer-coarse:items-center pointer-coarse:justify-center ${
                active ? 'bg-accent text-deep' : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
