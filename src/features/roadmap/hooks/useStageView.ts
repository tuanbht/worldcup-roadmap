import { useCallback, useEffect, useState } from 'react';
import type { RoadmapFocus } from '../graph-model';

const VALID: readonly RoadmapFocus[] = ['all', 'groups', 'knockout'];
const DEFAULT_FOCUS: RoadmapFocus = 'all';

function readFocus(): RoadmapFocus {
  if (typeof window === 'undefined') return DEFAULT_FOCUS;
  const param = new URLSearchParams(window.location.search).get('focus');
  return VALID.includes(param as RoadmapFocus) ? (param as RoadmapFocus) : DEFAULT_FOCUS;
}

/**
 * Camera focus for the continuous canvas, persisted to the `?focus=` URL param
 * for shareable links. The graph shape never changes — focus only drives where
 * the viewport is framed (group band, knockout, or the whole roadmap).
 */
export function useStageView(): { focus: RoadmapFocus; setFocus: (focus: RoadmapFocus) => void } {
  const [focus, setFocusState] = useState<RoadmapFocus>(DEFAULT_FOCUS);

  // Hydrate from the URL after mount (client-only SPA, no SSR mismatch).
  useEffect(() => setFocusState(readFocus()), []);

  const setFocus = useCallback((next: RoadmapFocus) => {
    setFocusState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('focus', next);
    window.history.replaceState(null, '', url);
  }, []);

  return { focus, setFocus };
}
