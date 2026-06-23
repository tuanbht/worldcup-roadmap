# Requirement: Refetch only on window focus — zero query intervals

## Context

Reviewed the whole `src/` tree for timer-based fetching. Findings:

- **Two query intervals (must be removed):**
  - `src/features/roadmap/hooks/useTournamentQuery.ts` — `REFETCH_INTERVAL_MS = 45_000` (line 6) used as
    `refetchInterval` (line 38).
  - `src/features/roadmap/hooks/useMatchDetailQuery.ts` — `REFETCH_INTERVAL_MS = 30_000` (line 14) used as
    `refetchInterval: isLive ? … : false` (line 59).
- **Focus refetch is OFF:** `src/lib/queryClient.ts` has `refetchOnWindowFocus: false` (with `staleTime: 30_000`,
  `gcTime: 5m`, `retry: 1`).
- **No `setInterval` polling remains** — the old hand-rolled loop was already replaced by TanStack Query.
- **Out of scope — leave untouched:** two one-shot `setTimeout`s that animate the view, not fetch data —
  `useFitOnChange.ts:11` (60 ms debounce before `fitView`) and `useFocusCamera.ts:56` (camera-animation delay).

Owner wants **no query intervals anywhere**; refresh data **only when the window/tab regains focus**
(TanStack Query's built-in `refetchOnWindowFocus`).

## Decision

1. **`src/lib/queryClient.ts`** — set `refetchOnWindowFocus: true` (was `false`). Keep `staleTime ≈ 30s` so a
   return-to-tab only refetches **stale** queries (prevents refetch storms on rapid tab toggling).
   `refetchOnReconnect` stays at its default (`true`); `retry: 1` unchanged. Fix the doc comment that still
   references "the 45s `refetchInterval`".
2. **`useTournamentQuery.ts`** — remove `refetchInterval` **and** the now-dead `REFETCH_INTERVAL_MS` constant.
   The feed refreshes on mount + window focus (when stale) + reconnect.
3. **`useMatchDetailQuery.ts`** — remove `refetchInterval` entirely (drop the `isLive` interval branch) **and**
   the dead `REFETCH_INTERVAL_MS` constant. Keep `enabled` (selected match only) + `staleTime`.

## Reconcile other specs

- **`match-detail-panel.md`** previously planned a "short refetch interval while the match is live." That is
  **removed** — match detail is focus-only too. This requirement is the single source of truth for refetch
  behavior. (The match-detail spec's `useMatchDetailQuery` line is updated to match.)

## Tradeoff (accepted)

A live match's score won't tick while you watch unless the tab loses and regains focus — the literal meaning of
focus-only. If live ticking is wanted later, re-introduce a short `refetchInterval` for `useMatchDetailQuery`
**only** while `isLive`, as a single documented exception to this requirement.

## How it behaves (built-in)

`refetchOnWindowFocus: true` refetches a query **only if it is stale** (past `staleTime`) when the window
regains focus — so `staleTime` is the eagerness knob. With no `refetchInterval`, nothing fetches while the tab
is hidden or idle.

## Tests to update

- `useTournamentQuery.test.tsx` — drop the polling/interval assumption; assert no `refetchInterval` and that
  data still loads on mount.
- The match-detail query test — assert no `refetchInterval`.
- (optional) a `queryClient` test asserting `refetchOnWindowFocus === true`.

## Acceptance criteria (testable)

- `grep -rn "refetchInterval" src` returns **nothing** (both constants removed too).
- No `setInterval`-based data polling anywhere; the two one-shot `setTimeout`s (fitView, focus camera) remain
  untouched.
- `queryClient` default options have `refetchOnWindowFocus: true`.
- Returning focus to the tab refetches stale data; a hidden/idle tab issues no fetches; data loads on mount.

## Notes

- Built-in behavior — **no new dependency**.
- The server-side Hono TTL cache is unrelated and stays — it is not a client query interval.
