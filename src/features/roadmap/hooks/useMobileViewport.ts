import { useEffect, useState } from 'react';
import { MOBILE_MAX_WIDTH } from '@/features/roadmap/responsive';

/** The matchMedia query that mirrors the `max-[640px]`/`sm` Tailwind cutover. */
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/** Read the current match, guarding the absent-matchMedia (SSR/jsdom) case. */
function readMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * `{ isMobile }` driven by `matchMedia('(max-width: 640px)')`. Subscribes once on
 * mount (cleanup on unmount, no listener leak) so a rotation/resize across the
 * 640px seam flips `isMobile`. Never throws when `window.matchMedia` is absent
 * (jsdom default / SSR) — it returns `{ isMobile: false }` so any suite that
 * mounts a consumer transitively stays safe.
 */
export function useMobileViewport(): { readonly isMobile: boolean } {
  const [isMobile, setIsMobile] = useState<boolean>(readMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    // Sync once in case the query changed between the initial read and subscribe.
    setIsMobile(mql.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Legacy Safari fallback.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return { isMobile };
}
