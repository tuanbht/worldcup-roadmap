import type { KeyboardEvent } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Optional: stable `id` for a tab (enables `aria-labelledby` on a tabpanel). */
  getOptionId?: (value: T) => string;
  /** Optional: the id of the tabpanel a tab controls (`aria-controls`). */
  getControlsId?: (value: T) => string;
  /** Optional: roving-tabindex keyboard handler owned by the parent widget. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Shared `role="tablist"` segmented control: `role="tab"` buttons with
 * `aria-selected`. Use when each option has a corresponding `role="tabpanel"`
 * in the DOM (e.g. MatchDetailTabs, StageToggle).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  getOptionId,
  getControlsId,
  onKeyDown,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="border-edge bg-surf-1/80 flex gap-1 rounded-full border p-1 backdrop-blur"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={getOptionId?.(option.value)}
            aria-selected={active}
            aria-controls={getControlsId?.(option.value)}
            tabIndex={getOptionId ? (active ? 0 : -1) : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors pointer-coarse:inline-flex pointer-coarse:min-h-[44px] pointer-coarse:items-center pointer-coarse:justify-center ${
              active ? 'bg-accent text-deep' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
