import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

/** Keyboard shortcuts: F = fit, 0 = reset zoom, Esc = clear selection. */
export function useBracketKeyboard(onEscape: () => void): void {
  const { fitView, zoomTo } = useReactFlow();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
      if (e.key === 'f' || e.key === 'F') void fitView({ padding: 0.12, duration: 300 });
      else if (e.key === '0') void zoomTo(1, { duration: 300 });
      else if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fitView, zoomTo, onEscape]);
}
