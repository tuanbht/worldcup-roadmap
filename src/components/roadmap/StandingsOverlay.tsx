import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Group } from '@/domain/types';
import { GroupTableNode } from '@/components/nodes/GroupTableNode';

interface StandingsOverlayProps {
  /** The group to show standings for, or null when the overlay is closed. */
  group: Group | null;
  /** Close the overlay; the canvas restores focus to the originating header. */
  onClose: () => void;
}

/**
 * On-demand standings panel opened from a `group-header`. A `role="dialog"`
 * overlay that:
 *  - moves focus to the close button on open,
 *  - owns Esc ONLY while open and `stopPropagation()`s it, so the canvas's
 *    window-level Esc (clear match selection) does not also fire,
 *  - closes on backdrop click,
 *  - restores focus to the originating header (handled by the caller's `onClose`).
 */
export function StandingsOverlay({ group, onClose }: StandingsOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!group) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [group, onClose]);

  if (!group) return null;

  return (
    <div
      className="bg-bg/70 absolute inset-0 z-20 grid place-items-center backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Group ${group.name} standings`}
        className="relative [contain:layout_paint]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close standings"
          className="border-edge bg-surf-2 text-muted hover:text-ink hover:border-edge-strong focus-visible:border-accent absolute -top-3 -right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
        >
          <X size={15} aria-hidden="true" />
        </button>
        <GroupTableNode group={group} />
      </div>
    </div>
  );
}
