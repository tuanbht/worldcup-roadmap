// Node environment (global vitest default). Asserts the singleton QueryClient's
// default query options encode the focus-only refetch policy (Part 2). No React
// render needed — we read `getDefaultOptions()` directly.
//
// AC8 (plan): refetchOnWindowFocus:true, staleTime:30_000, retry:1, no interval.
import { describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';

describe('queryClient default query options (focus-only refetch)', () => {
  const queries = queryClient.getDefaultOptions().queries;

  it('refetches on window focus (was false before this change)', () => {
    expect(queries?.refetchOnWindowFocus).toBe(true);
  });

  it('keeps staleTime ~30s so focus only refetches STALE queries (no storms)', () => {
    expect(queries?.staleTime).toBe(30_000);
  });

  it('keeps retry: 1 unchanged', () => {
    expect(queries?.retry).toBe(1);
  });

  it('keeps gcTime at 5 minutes (cache retention unchanged by the refetch switch)', () => {
    expect(queries?.gcTime).toBe(5 * 60_000);
  });

  it('configures no refetchInterval at the client level (zero query polling)', () => {
    // The interval policy is removed entirely; the client must not reintroduce
    // it as a default. Undefined/false both mean "no interval".
    expect(queries?.refetchInterval ?? false).toBe(false);
  });
});
