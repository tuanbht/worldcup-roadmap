# Requirement: Refetch only on window focus (drop interval polling)

## Context
Data currently refreshes on a **timer**: `useTournamentQuery.ts` sets `refetchInterval` (~45s) and
`useMatchDetailQuery.ts` sets `refetchInterval` while a match is live. Meanwhile `src/lib/queryClient.ts` has
`refetchOnWindowFocus: false`. So the app polls in the background even when the tab is hidden, and does **not**
refresh when the user returns to it. Owner wants the opposite — use TanStack Query's **built-in
`refetchOnWindowFocus`** and stop interval polling.

## Decision
1. **`src/lib/queryClient.ts`** — set `refetchOnWindowFocus: true` (was `false`). Keep a modest `staleTime`
   (≈30s) so a return-to-tab only refetches when data is actually stale (prevents a refetch storm from rapid
   tab toggling). `refetchOnReconnect` stays at its default (`true`) — coming back online is a sensible refresh
   trigger too.
2. **`useTournamentQuery.ts`** — **remove `refetchInterval`.** The tournament feed now refreshes on mount, on
   window focus (when stale), and on reconnect — no background timer.
3. **`useMatchDetailQuery.ts`** — **remove the live `refetchInterval`** as well, so refetch is focus-driven
   everywhere (consistent "built-in mode"). Keep `enabled` (only when a match is selected) and `staleTime`.

## Tradeoff to accept (flagged)
With match-detail also focus-only, an **open live match's score won't tick while you watch** unless the tab
loses and regains focus. This is the literal consequence of "refetch only on focus" and **supersedes the
"short refetch interval while the match is live" line in `match-detail-panel.md`**. If the owner later wants
live scores to tick while actively watching, re-introduce a short `refetchInterval` *only* for
`useMatchDetailQuery` while `isLive` — as a documented exception to this requirement.

## How it behaves (TanStack built-in)
- `refetchOnWindowFocus: true` refetches a query **only if it is stale** (past `staleTime`) when the window
  regains focus — so `staleTime` is the knob for how eager focus-refetch is.
- No `refetchInterval` ⇒ no `setInterval`-style background polling; nothing fetches while the tab is hidden/idle.

## Acceptance criteria (testable)
- `queryClient` default options have `refetchOnWindowFocus: true`.
- Neither `useTournamentQuery` nor `useMatchDetailQuery` sets `refetchInterval` (and no `setInterval` polling
  exists anywhere).
- Returning focus to the tab triggers a refetch when data is stale; leaving the tab triggers no fetches.
- Existing query/hook tests updated to reflect no-interval + focus-on; data still loads on mount.

## Notes
- This is a network/battery win: the background graph stops polling every 45s and only refreshes when the user
  is actually looking.
- No new dependency — `refetchOnWindowFocus` and `refetchOnReconnect` are built into `@tanstack/react-query`.
