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
}

/**
 * The team identity cell content: a decorative `<Flag>` glyph (`aria-hidden`) +
 * truncated team name. This is plain, non-interactive content in BOTH render
 * paths. On the canvas the focus-team control is the full-row-spanning
 * `<button>` rendered alongside it (see `FocusRowButton`); the flag itself is
 * never its own button (requirement 2026-06-24-1030, row-as-tap-target).
 */
function TeamCell({ row }: TeamCellProps) {
  const { team } = row;
  return (
    <span className="text-ink flex items-center gap-2 font-medium">
      <Flag code={team.code} url={team.flagUrl} size={18} />
      <span className="min-w-0 truncate">{team.name}</span>
    </span>
  );
}

interface FocusRowButtonProps {
  row: StandingRow;
  onFocusTeam: (teamId: string) => void;
}

/**
 * The canvas standings row's focus-team control: a real `<button>` rendered
 * inside the STATIC Team `<td>` and stretched across the FULL row via
 * `position: absolute; inset: 0`. Because the Team `<td>` is static, `inset-0`
 * resolves against the `position: relative` `<tr>` (the sole positioned ancestor),
 * so the button spans the whole ~294px row (~94px on-screen at the 0.32 mobile
 * zoom floor → a ≥44px-wide tap target with zero overlap → no mis-tap).
 *
 * It is transparent (no background/border) so it never changes the row's paint;
 * it only provides the hit area + accessible name + keyboard activation. A native
 * `<button>` fires `click` on both Enter and Space, so keyboard activation is
 * intrinsic; we also `stopPropagation` on pointerdown/click/keydown and carry
 * `nopan` so a row tap never starts a React Flow pan or selects the node.
 */
function FocusRowButton({ row, onFocusTeam }: FocusRowButtonProps) {
  const { team } = row;
  const focus = () => onFocusTeam(team.id);
  return (
    <button
      type="button"
      className="nopan absolute inset-0 z-10 cursor-pointer rounded-[3px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
      aria-label={`Show matches for ${team.name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        focus();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.stopPropagation();
      }}
    />
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
  // Density layer: gated behind `compact` so the non-compact branch (desktop ≥1024,
  // the full 7-stat set, AND the 641–768 overlay) emits today's EXACT class strings.
  // The compact branch drops the 0.06em tracking on the short labels, bumps the
  // header + table font one step, and trims header vertical padding to offset the
  // larger glyph — breathing room for the numeric columns comes from these levers,
  // never from widening the held-flat `<colgroup>` widths.
  //
  // Two fragments (size+padding, then tracking) preserve the ORIGINAL class order:
  // `…border-t {TH_SIZE} font-semibold {TH_TRACKING} uppercase`, so the non-compact
  // branch is byte-identical to the string emitted before the density layer existed.
  const TABLE_FONT = compact ? 'text-[0.82rem]' : 'text-[0.78rem]';
  const TH_SIZE = compact
    ? '[&>th]:py-0.5 [&>th]:text-[0.72rem]'
    : '[&>th]:py-1 [&>th]:text-[0.68rem]';
  const TH_TRACKING = compact ? '[&>th]:tracking-normal' : '[&>th]:tracking-[0.06em]';
  return (
    <section
      aria-label={`Group ${group.name} standings`}
      className="border-edge from-surf-2 to-surf-1 w-[296px] overflow-hidden rounded-[14px] border bg-gradient-to-b shadow-[var(--elevation-card)] [contain:layout_paint]"
    >
      <GroupHeader name={group.name} onOpenStandings={onOpenStandings} />
      {/* table-fixed + narrow tabular-nums numeric columns so a long team name
          (e.g. "Bosnia and Herzegovina") truncates instead of pushing the stat
          columns past the 296px card edge, where overflow-hidden would clip them. */}
      <table className={`w-full table-fixed border-collapse ${TABLE_FONT}`}>
        <colgroup>
          <col className="w-6" />
          <col />
          {statColumns.map((c) => (
            <col key={c.key} className="w-7" />
          ))}
          <col className="w-9" />
        </colgroup>
        <thead>
          <tr
            className={`[&>th]:border-edge [&>th]:text-dim [&>th]:border-t ${TH_SIZE} [&>th]:font-semibold ${TH_TRACKING} [&>th]:uppercase`}
          >
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
              className={`tabular-nums [&>td]:py-[5px] ${onFocusTeam ? 'relative' : ''} ${row.qualified ? 'bg-accent/15 standings-row--accent' : ''}`}
            >
              <td className="text-muted pl-3 text-center">{row.position}</td>
              {/* The Team <td> stays STATIC (no `relative`) so the focus button's
                  `inset-0` resolves against the `position: relative` <tr> and spans
                  the full row, not the narrow Team cell. */}
              <td className="px-2 text-left">
                {onFocusTeam ? <FocusRowButton row={row} onFocusTeam={onFocusTeam} /> : null}
                <TeamCell row={row} />
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
