import { memo } from 'react';
import type { StandingRow } from '@/domain/types';
import type { GroupTableProps } from '@/features/roadmap/graph-model';
import { Flag } from '@/components/ui/Flag';

function gd(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/** Secondary numeric columns folded under the LOD detail fade at low zoom. */
interface StatColumn {
  readonly key: string;
  readonly label: string;
  readonly value: (row: StandingRow) => string | number;
  /** Hidden at overview zoom (data-lod-detail) when true. */
  readonly detail: boolean;
}

const STAT_COLUMNS: readonly StatColumn[] = [
  { key: 'mp', label: 'MP', value: (r) => r.played, detail: true },
  { key: 'w', label: 'W', value: (r) => r.won, detail: true },
  { key: 'd', label: 'D', value: (r) => r.draw, detail: true },
  { key: 'l', label: 'L', value: (r) => r.lost, detail: true },
  { key: 'gf', label: 'GF', value: (r) => r.goalsFor, detail: true },
  { key: 'ga', label: 'GA', value: (r) => r.goalsAgainst, detail: true },
  { key: 'gd', label: 'GD', value: (r) => gd(r.goalDifference), detail: false },
];

/** Sorted ascending by `position` so the table reads 1..N top-to-bottom. */
function byPosition(a: StandingRow, b: StandingRow): number {
  return a.position - b.position;
}

interface TeamCellProps {
  row: StandingRow;
  onFocusTeam?: (teamId: string) => void;
}

/**
 * The team identity cell: flag + truncated name. When `onFocusTeam` is given the
 * flag becomes a focusable `<button>` (native Enter/Space) that sets team focus;
 * its click/pointerdown `stopPropagation` so the surrounding React Flow node never
 * selects or starts a pan, and it carries the built-in `nopan` class. Without a
 * handler (the overlay path) the flag stays a decorative `aria-hidden` span.
 */
function TeamCell({ row, onFocusTeam }: TeamCellProps) {
  const { team } = row;
  const flag = <Flag code={team.code} url={team.flagUrl} size={18} />;
  return (
    <span className="text-ink flex items-center gap-2 font-medium">
      {onFocusTeam ? (
        <button
          type="button"
          className="nopan shrink-0 rounded-[3px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
          aria-label={`Show matches for ${team.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onFocusTeam(team.id);
          }}
        >
          {flag}
        </button>
      ) : (
        flag
      )}
      <span className="min-w-0 truncate">{team.name}</span>
    </span>
  );
}

/**
 * Standings table for one group: the full Google-style column set
 * (# / Team / MP / W / D / L / GF / GA / GD / Pts), ordered by `position`, with
 * Pts emphasized and qualified rows accented. Rendered inside the always-on
 * `GroupStandingsNode` and the on-demand `StandingsOverlay` — `onFocusTeam` is
 * present only on the former, turning each resolved row's flag into a focus
 * trigger (item 3).
 */
function GroupTableNodeImpl({ group, onFocusTeam }: GroupTableProps) {
  const rows = [...group.table].sort(byPosition);
  return (
    <section
      aria-label={`Group ${group.name} standings`}
      className="border-edge from-surf-2 to-surf-1 w-[296px] overflow-hidden rounded-[14px] border bg-gradient-to-b shadow-[var(--elevation-card)] [contain:layout_paint]"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="bg-accent font-display text-deep inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[0.85rem] font-extrabold">
          {group.name}
        </span>
        <h3 className="text-ink text-[0.95rem]">Group {group.name}</h3>
      </header>
      {/* table-fixed + narrow tabular-nums numeric columns so a long team name
          (e.g. "Bosnia and Herzegovina") truncates instead of pushing the stat
          columns past the 296px card edge, where overflow-hidden would clip them. */}
      <table className="w-full table-fixed border-collapse text-[0.78rem]">
        <colgroup>
          <col className="w-6" />
          <col />
          {STAT_COLUMNS.map((c) => (
            <col key={c.key} className="w-7" />
          ))}
          <col className="w-9" />
        </colgroup>
        <thead>
          <tr className="[&>th]:border-edge [&>th]:text-dim [&>th]:border-t [&>th]:py-1 [&>th]:text-[0.68rem] [&>th]:font-semibold [&>th]:tracking-[0.06em] [&>th]:uppercase">
            <th scope="col" className="pl-3 text-center">
              #
            </th>
            <th scope="col" className="px-2 text-left">
              Team
            </th>
            {STAT_COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                data-lod-detail={c.detail || undefined}
                className="text-center"
              >
                {c.label}
              </th>
            ))}
            <th scope="col" className="pr-2 text-center">
              Pts
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr
              key={row.team.id}
              className={`tabular-nums [&>td]:py-[5px] ${row.qualified ? 'bg-accent/15 standings-row--accent' : ''}`}
            >
              <td className="text-muted pl-3 text-center">{row.position}</td>
              <td className="px-2 text-left">
                <TeamCell row={row} onFocusTeam={onFocusTeam} />
              </td>
              {STAT_COLUMNS.map((c) => (
                <td
                  key={c.key}
                  data-lod-detail={c.detail || undefined}
                  className="text-muted text-center"
                >
                  {c.value(row)}
                </td>
              ))}
              <td className="text-ink pr-2 text-center font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const GroupTableNode = memo(GroupTableNodeImpl);
export type { GroupTableProps };
