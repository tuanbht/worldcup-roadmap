'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RoadmapView } from '../graph-model';

const VALID: readonly RoadmapView[] = ['groups', 'bracket', 'full'];
const DEFAULT_VIEW: RoadmapView = 'bracket';

function readView(): RoadmapView {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const param = new URLSearchParams(window.location.search).get('view');
  return VALID.includes(param as RoadmapView) ? (param as RoadmapView) : DEFAULT_VIEW;
}

/** Active roadmap view, persisted to the `?view=` URL param for shareable links. */
export function useStageView(): { view: RoadmapView; setView: (view: RoadmapView) => void } {
  const [view, setViewState] = useState<RoadmapView>(DEFAULT_VIEW);

  // Hydrate from the URL after mount (avoids SSR/CSR mismatch).
  useEffect(() => setViewState(readView()), []);

  const setView = useCallback((next: RoadmapView) => {
    setViewState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }, []);

  return { view, setView };
}
