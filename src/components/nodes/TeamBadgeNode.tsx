import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { refLabel } from '@/domain/types';
import type { TeamBadgeFlowNode } from '@/features/roadmap/graph-model';
import { Flag } from '@/components/ui/Flag';

const BADGE_PX = 40;

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';

/**
 * Outer-ring circular flag badge (one of the 32 R32 participants). A round
 * `Flag shape="round"` roundel with a code caption, a hidden inner-side source
 * `Handle` for the radial edge, `data-focus` from `focusState`, and — for a
 * RESOLVED team with an `onFocusTeam` handler — a `nopan` focus-team
 * `<button aria-label="Show matches for {team}">` overlaying the roundel (the
 * proven TeamRow `absolute inset-0` ≥44px tap-target pattern). An eliminated team
 * desaturates + dims; a placeholder (TBD) slot renders the round monogram
 * fallback and NO focus button (nothing to focus yet).
 */
function TeamBadgeNodeImpl({ data }: NodeProps<TeamBadgeFlowNode>) {
  const { team, code, flagUrl, teamId, eliminated, focusState, onFocusTeam } = data;
  const resolved = team.kind === 'team';
  const interactive = resolved && teamId !== null && onFocusTeam !== undefined;
  const label = refLabel(team);

  return (
    <div
      className={`radial-badge ${eliminated ? 'radial-badge--eliminated' : ''}`.trim()}
      data-focus={focusState}
      data-eliminated={eliminated ? 'true' : undefined}
      style={{ width: BADGE_PX }}
    >
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE} />
      <div className="radial-badge__roundel relative grid place-items-center">
        <Flag code={code} url={flagUrl} size={BADGE_PX} shape="round" />
        {interactive && (
          <button
            type="button"
            className="nopan radial-badge__focus absolute -inset-1.5 z-10 cursor-pointer rounded-full focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
            aria-label={`Show matches for ${label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onFocusTeam(teamId);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.stopPropagation();
            }}
          />
        )}
      </div>
      <span
        className="radial-badge__code text-dim mt-1 block truncate text-center text-[0.62rem] font-semibold tracking-[0.04em]"
        title={label}
      >
        {code ?? '···'}
      </span>
    </div>
  );
}

export const TeamBadgeNode = memo(TeamBadgeNodeImpl);
