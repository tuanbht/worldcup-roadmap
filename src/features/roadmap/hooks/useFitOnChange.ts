'use client';

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

/** Re-fit the viewport whenever `key` changes (view switch, data arrival). */
export function useFitOnChange(key: unknown): void {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: 0.18, duration: 400 }), 60);
    return () => window.clearTimeout(id);
  }, [key, fitView]);
}
