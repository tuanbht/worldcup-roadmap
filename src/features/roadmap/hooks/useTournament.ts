'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tournament } from '@/domain/types';
import type { ApiEnvelope } from '@/data/envelope';

interface TournamentState {
  data: Tournament | null;
  error: string | null;
  loading: boolean;
}

/**
 * Fetch the normalized tournament from /api/worldcup and poll for updates. The
 * route's own TTL cache absorbs the polling, so this never hammers FIFA.
 */
export function useTournament(pollMs = 45_000): TournamentState {
  const [state, setState] = useState<TournamentState>({ data: null, error: null, loading: true });
  const hasData = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/worldcup', { signal, cache: 'no-store' });
      const json = (await res.json()) as ApiEnvelope<Tournament>;
      if (json.success) {
        hasData.current = true;
        setState({ data: json.data, error: null, loading: false });
      } else {
        setState((prev) => ({ data: prev.data, error: json.error.message, loading: false }));
      }
    } catch (error: unknown) {
      if ((error as Error)?.name === 'AbortError') return;
      setState((prev) => ({
        data: prev.data,
        error: prev.data ? null : (error as Error).message,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const id = window.setInterval(() => void load(), pollMs);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [load, pollMs]);

  return state;
}
