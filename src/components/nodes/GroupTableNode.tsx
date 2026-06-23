import { memo } from 'react';
import type { StandingRow } from '@/domain/types';
import type { GroupTableProps } from '@/features/roadmap/graph-model';
import { pickStandingsColumns } from '@/features/roadmap/responsive';
import { Flag } from '@/components/ui/Flag';

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
          className="nopan shrink-0 rounded-[3px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none pointer-coarse:-m-[13px] pointer-coarse:inline-flex pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:items-center pointer-coarse:justify-center"
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

/** Badge + title shared by the interactive (opener) and plain header variants. */
function HeaderContent({ name }: { name: string }) {
  return (
    <>
      <span className="bg-accent font-display text-deep inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[0.85rem] font-extrabold">
        {name}
      </span>
      <h3 className="text-ink text-[0.95rem]">Group {name}</h3>
    </>
  );
}

const HEADER_LAYOUT = 'flex w-full items-center gap-2 px-3 pt-3 pb-2 text-left';

/**
 * The standings header. When `onOpenStandings` is supplied (the always-on node)
 * it renders as a `<button>` that opens the overlay for this group — re-homed
 * from the deleted column-title pill. Without it (the overlay path) it stays a
 * plain non-interactive `<header>`.
 */
function GroupHeader({
  name,
  onOpenStandings,
}: {
  name: string;
  onOpenStandings?: (group: string) => void;
}) {
  if (!onOpenStandings) {
    return (
      <header className={HEADER_LAYOUT}>
        <HeaderContent name={name} />
      </header>
    );
  }
  return (
    <header>
      <button
        type="button"
        aria-label={`Open Group ${name} standings`}
        className={`nopan ${HEADER_LAYOUT} cursor-pointer rounded-t-[14px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpenStandings(name);
        }}
      >
        <HeaderContent name={name} />
      </button>
    </header>
  );
}

/**
 * Standings table for one group: the full Google-style column set
 * (# / Team / MP / W / D / L / GF / GA / GD / Pts), ordered by `position`, with
 * Pts emphasized and qualified rows accented. Rendered inside the always-on
 * `GroupStandingsNode` and the on-demand `StandingsOverlay` — `onFocusTeam` (row
 * flag focus, item 3) and `onOpenStandings` (header opener) are present only on
 * the former.
 */
function GroupTableNodeImpl({ group, onFocusTeam, onOpenStandings, compact }: GroupTableProps) {
  const rows = [...group.table].sort(byPosition);
  const statColumns = pickStandingsColumns(compact ? 'compact' : 'full');
  return (
    <section
      aria-label={`Group ${group.name} standings`}
      className="border-edge from-surf-2 to-surf-1 w-[296px] overflow-hidden rounded-[14px] border bg-gradient-to-b shadow-[var(--elevation-card)] [contain:layout_paint]"
    >
      <GroupHeader name={group.name} onOpenStandings={onOpenStandings} />
      {/* table-fixed + narrow tabular-nums numeric columns so a long team name
          (e.g. "Bosnia and Herzegovina") truncates instead of pushing the stat
          columns past the 296px card edge, where overflow-hidden would clip them. */}
      <table className="w-full table-fixed border-collapse text-[0.78rem]">
        <colgroup>
          <col className="w-6" />
          <col />
          {statColumns.map((c) => (
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
            {statColumns.map((c) => (
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
              {statColumns.map((c) => (
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
