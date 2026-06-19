import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { MatchDetail } from '@/domain/types';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TimelineTab } from './TimelineTab';
import { LineupsTab } from './LineupsTab';
import { StatsTab } from './StatsTab';

type TabValue = 'timeline' | 'lineups' | 'stats';

const TABS: ReadonlyArray<{ value: TabValue; label: string }> = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'lineups', label: 'Lineups' },
  { value: 'stats', label: 'Stats' },
];

export interface MatchDetailTabsProps {
  readonly detail: MatchDetail;
  /** Home/away display names for event/stat rows. */
  readonly homeName: string;
  readonly awayName: string;
}

/**
 * The complete ARIA tabs pattern (tablist + arrow-key roving tabindex +
 * `role="tabpanel"` with `aria-labelledby`/`aria-controls`) wrapping the
 * Timeline / Lineups / Stats panels. Active tab in component state.
 */
export function MatchDetailTabs({
  detail,
  homeName,
  awayName,
}: MatchDetailTabsProps): ReactElement {
  const [active, setActive] = useState<TabValue>('timeline');
  const baseId = useId();

  const tabId = (value: TabValue) => `${baseId}-tab-${value}`;
  const panelId = (value: TabValue) => `${baseId}-panel-${value}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.value === active);
    let next = index;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % TABS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const value = TABS[next].value;
    setActive(value);
    document.getElementById(tabId(value))?.focus();
  };

  const renderPanelBody = (value: TabValue): ReactElement => {
    switch (value) {
      case 'timeline':
        return <TimelineTab detail={detail} />;
      case 'lineups':
        return (
          <LineupsTab
            home={detail.home}
            away={detail.away}
            homeName={homeName}
            awayName={awayName}
          />
        );
      case 'stats':
        return <StatsTab detail={detail} />;
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SegmentedControl
        options={TABS}
        value={active}
        onChange={setActive}
        ariaLabel="Match detail sections"
        getOptionId={tabId}
        getControlsId={panelId}
        onKeyDown={onKeyDown}
      />
      {/*
        Render one tabpanel per tab so every tab's `aria-controls` resolves to a
        present element (no dangling reference — CR-3 / WAI-ARIA tab pattern).
        Inactive panels carry `hidden`, removing them from the a11y tree and the
        tab order; their bodies stay unmounted so heavy subtrees aren't built.
      */}
      {TABS.map(({ value }) => {
        const isActive = value === active;
        return (
          <div
            key={value}
            role="tabpanel"
            id={panelId(value)}
            aria-labelledby={tabId(value)}
            hidden={!isActive}
            tabIndex={isActive ? 0 : -1}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {isActive && renderPanelBody(value)}
          </div>
        );
      })}
    </div>
  );
}
