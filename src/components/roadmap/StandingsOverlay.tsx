import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Group } from '@/domain/types';
import { GroupTableNode } from '@/components/nodes/GroupTableNode';
import { useMobileViewport } from '@/features/roadmap/hooks/useMobileViewport';

interface StandingsOverlayProps {
  /** The group to show standings for, or null when the overlay is closed. */
  group: Group | null;
  /** Close the overlay; the canvas restores focus to the originating header. */
  onClose: () => void;
}

/**
 * On-demand standings panel opened from a group's standings-table header button.
 * A `role="dialog"`
 * overlay that:
 *  - moves focus to the close button on open,
 *  - owns Esc ONLY while open and `stopPropagation()`s it, so the canvas's
 *    window-level Esc (clear match selection) does not also fire,
 *  - closes on backdrop click,
 *  - restores focus to the originating header (handled by the caller's `onClose`).
 */
export function StandingsOverlay({ group, onClose }: StandingsOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { isMobile } = useMobileViewport();

  useEffect(() => {
    if (!group) return;
    // preventScroll: focusing the close button must NOT scroll the document to
    // bring it into view — that would shift the whole page horizontally over the
    // transformed canvas (a non-deterministic jump / snapshot flake). The dialog
    // is already centred in the viewport, so no scroll-into-view is needed.
    closeRef.current?.focus({ preventScroll: true });
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
      className="bg-bg/70 absolute inset-0 z-20 grid place-items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Group ${group.name} standings`}
        // Viewport-bounded so the 296px card + its close button never exceed a
        // 320px screen (max-w-[calc(100vw-2rem)] pairs with the backdrop's p-4).
        className="relative max-w-[calc(100vw-2rem)] [contain:layout_paint]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close standings"
          // Sits INSIDE the card's top-right corner (not bleeding `-top-3 -right-3`
          // off the edge) so it stays in-viewport at 320px. Coarse pointers get a
          // ≥44px hit area without changing the 28px desktop visual size.
          className="border-edge bg-surf-2 text-muted hover:text-ink hover:border-edge-strong focus-visible:border-accent absolute top-1.5 right-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
        >
          <X size={15} aria-hidden="true" />
        </button>
        <GroupTableNode group={group} compact={isMobile} />
      </div>
    </div>
  );
}
