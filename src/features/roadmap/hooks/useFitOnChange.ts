import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

/** Padding tuned to frame the tall, continuous group-band + knockout canvas. */
const FIT_PADDING = 0.12;

/** Re-fit the viewport whenever `key` changes (data arrival, node-count change). */
export function useFitOnChange(key: unknown): void {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: FIT_PADDING, duration: 400 }), 60);
    return () => window.clearTimeout(id);
  }, [key, fitView]);
}
