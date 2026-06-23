import type { KeyboardEvent } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

/**
 * Controls which ARIA pattern the container and its buttons use.
 *
 * - `'tablist'` (default) — `role="tablist"` / `role="tab"` / `aria-selected`.
 *   Use when each option has a corresponding `role="tabpanel"` in the DOM
 *   (e.g. MatchDetailTabs, StageToggle).
 *
 * - `'radiogroup'` — `role="radiogroup"` / `role="radio"` / `aria-checked`.
 *   Use for a mode switch that has NO associated panels (e.g. InteractionModeToggle).
 *   AF-5: A mode switch with no tabpanels must not claim tablist/tab semantics.
 */
type SegmentedControlVariant = 'tablist' | 'radiogroup';

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /**
   * ARIA role variant. Defaults to `'tablist'` for backward-compatibility.
   * Pass `'radiogroup'` for a mode switch that has no tabpanels (AF-5).
   */
  variant?: SegmentedControlVariant;
  /** Optional: stable `id` for a tab (enables `aria-labelledby` on a tabpanel). */
  getOptionId?: (value: T) => string;
  /** Optional: the id of the tabpanel a tab controls (`aria-controls`). */
  getControlsId?: (value: T) => string;
  /** Optional: roving-tabindex keyboard handler owned by the parent widget. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'tablist',
  getOptionId,
  getControlsId,
  onKeyDown,
}: SegmentedControlProps<T>) {
  const isRadioGroup = variant === 'radiogroup';

  return (
    <div
      role={isRadioGroup ? 'radiogroup' : 'tablist'}
      aria-label={ariaLabel}
      className="border-edge bg-surf-1/80 flex gap-1 rounded-full border p-1 backdrop-blur"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={isRadioGroup ? 'radio' : 'tab'}
            id={getOptionId?.(option.value)}
            {...(isRadioGroup
              ? { 'aria-checked': active }
              : {
                  'aria-selected': active,
                  'aria-controls': getControlsId?.(option.value),
                })}
            tabIndex={getOptionId ? (active ? 0 : -1) : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors ${
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
