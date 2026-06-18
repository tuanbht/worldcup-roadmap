# Plan: Focus-Current-Match Button

Add a canvas control that centers the camera on the "current" match — the live match if one is in play, otherwise the next match still to finish — by resolving a target match id with a pure function and driving React Flow's `setCenter`.

## Scope

### In scope
- A pure target-resolution function `pickFocusMatchId(matches, nowMs)` in `src/features/roadmap/focus-target.ts` (+ named `MATCH_DURATION_MS` constant). Fully unit-tested.
- A small imperative hook `useFocusMatch` in `src/features/roadmap/hooks/useFocusMatch.ts` that, given a matchId, reads the node position from React Flow and calls `setCenter(...)` (named zoom/duration constants). Briefly selects/highlights the focused node via a callback.
- A `FocusMatchButton` component (real `<button>` inside a React Flow `<Panel>`) with a lucide icon, accessible `aria-label`, visible focus state, disabled when there is no target, and a subtle "live" accent when the target is live.
- Wiring in `RoadmapCanvas.tsx`: compute the target id from `tournament.matches` + `Date.now()`, render the button, focus on click, and select the node.
- Add the three new production files to `vitest.config.ts` coverage `include` (it is an explicit allowlist).
- Unit tests for `pickFocusMatchId`; component tests for `FocusMatchButton`; a hook test for `useFocusMatch`.

### Out of scope
- No change to graph building, layout geometry, or domain types.
- No new domain logic library; `pickFocusMatchId` lives inside the roadmap feature (domain-specific, not library-ized).
- No re-architecture of `useFocusCamera` (the existing focus-enum camera hook stays as-is for All/Groups/Knockout).
- No realtime "is-it-still-live" ticking/auto-refocus; resolution happens at click time (and re-renders) using `Date.now()`. Tournament data already refetches every 45s via TanStack Query.
- No e2e test authored here (documented as optional; browsers may be unavailable in CI).

## Approach

The owner's rule — "the match with ended estimate time nearest in the future" — is a pure, testable selection over `tournament.matches`. Every `Match.kickoff` is a non-nullable ISO string and `Match.status` can be `'live'`, so we compute `estimatedEnd = kickoffMs + MATCH_DURATION_MS`, keep only candidates whose `estimatedEnd > nowMs` (not yet ended), and pick the minimum `estimatedEnd` (tiebreak kickoff, then id). A live match's end is in the near future and therefore wins naturally over later-scheduled games; when nothing is live the next kickoff wins; when all matches have ended the function returns `null` and the button is disabled. This keeps all temporal logic in one O(n) pure function that tests drive with a fixed `now`, while the component merely passes `Date.now()`.

For the camera move we use `useReactFlow().getNode(matchId)` + `setCenter(centerX, centerY, { zoom, duration })` rather than the existing `useFocusCamera`. `useFocusCamera` is declarative (it reacts to a `focus` enum changing inside a `useEffect`) and frames a *set* of nodes via `fitBounds`; an imperative single-node center on a button click is a poor fit for that effect-driven shape. Reusing React Flow's `setCenter` (the same primitive `useFocusCamera` is built on) honors "reuse the existing camera-focus mechanism" while keeping the click path explicit and unit-testable.

**Rejected alternative:** extend `useFocusCamera`/the `RoadmapFocus` enum with a `'current'` value and let an effect move the camera when focus flips to `'current'`. Rejected because focusing the *current* match is an idempotent action (clicking again should re-center even if the enum value is unchanged), an effect-on-change model swallows repeat clicks, and overloading the All/Groups/Knockout `fitBounds` path with single-node `setCenter` logic muddies a clean, already-tested hook.

## Files

| Path | Action | Responsibility |
| --- | --- | --- |
| `src/features/roadmap/focus-target.ts` | create | Pure `pickFocusMatchId(matches, nowMs)` + `MATCH_DURATION_MS`, `FOCUS_ZOOM`, `FOCUS_DURATION_MS` constants. O(n), no mutation, no `Date.now()` inside. |
| `src/features/roadmap/focus-target.test.ts` | create | Exhaustive unit tests for `pickFocusMatchId` (live wins, nearest-upcoming, null when all ended, boundary at exactly now, tiebreaks, immutability). Node env. |
| `src/features/roadmap/hooks/useFocusMatch.ts` | create | Imperative hook returning `focusMatch(matchId: string) => void`; reads node via `getNode`, computes center, calls `setCenter` with `FOCUS_ZOOM`/`FOCUS_DURATION_MS`; invokes an `onFocused(matchId)` callback for selection/highlight. |
| `src/features/roadmap/hooks/useFocusMatch.test.tsx` | create | Hook test (jsdom) with a mocked `useReactFlow` asserting `setCenter` is called with the node's center + named constants, and `onFocused` fires; no-op when node missing. |
| `src/components/roadmap/FocusMatchButton.tsx` | create | Presentational `<Panel>` + `<button>`: lucide icon, dynamic `aria-label`, `disabled` when `targetMatchId` is null, live accent when `isLive`, `onClick`. No data access. |
| `src/components/roadmap/FocusMatchButton.test.tsx` | create | Component tests (jsdom, inside `ReactFlowProvider`): renders button, aria-label variants, disabled state, invokes `onActivate` with the resolved id on click + keyboard. |
| `src/components/roadmap/RoadmapCanvas.tsx` | modify | Derive `{ targetMatchId, isLive }` from `tournament.matches` + `Date.now()` (memo keyed on matches), wire `useFocusMatch`, render `FocusMatchButton`, set `selected` on focus. |
| `vitest.config.ts` | modify | Add `focus-target.ts`, `hooks/useFocusMatch.ts`, `components/roadmap/FocusMatchButton.tsx` to coverage `include`. |

## Data Model / Types

No domain type changes. New module-local types and constants:

```ts
// src/features/roadmap/focus-target.ts
import type { Match } from '@/domain/types';

/**
 * A full match's wall-clock span: 2 x 45' regulation + 15' half-time + a
 * stoppage/cushion allowance, rounded to ~115 minutes. Chosen so a LIVE match's
 * estimatedEnd sits just ahead of `now` (and thus ahead of any not-yet-kicked
 * match), making "live ends soonest" fall out of the minimum-estimatedEnd rule.
 */
export const MATCH_DURATION_MS = 115 * 60 * 1000;

/** Readable single-card zoom and the camera glide duration for a focus click. */
export const FOCUS_ZOOM = 1.1;        // within minZoom 0.2 / maxZoom 1.8
export const FOCUS_DURATION_MS = 500; // matches the existing camera DURATION

/**
 * Target = the not-yet-ended match whose estimated end is nearest in the future.
 * estimatedEnd = kickoffMs + MATCH_DURATION_MS; candidates have estimatedEnd > now.
 * Pick min estimatedEnd; tiebreak by kickoff then matchId. Null when all ended.
 * Pure, O(n), never mutates `matches`, never reads the clock itself.
 */
export function pickFocusMatchId(
  matches: readonly Match[],
  nowMs: number,
): string | null;
```

```ts
// src/features/roadmap/hooks/useFocusMatch.ts
import { NODE_W, NODE_H } from '../layout/layout-constants';
import { FOCUS_ZOOM, FOCUS_DURATION_MS } from '../focus-target';

interface UseFocusMatchOptions {
  /** Called with the focused matchId after the camera move starts (selection/highlight). */
  onFocused?: (matchId: string) => void;
}
/** Returns a stable `focusMatch(matchId)` that centers the camera on that node. */
export function useFocusMatch(options?: UseFocusMatchOptions): {
  focusMatch: (matchId: string) => void;
};
// Internals: const node = getNode(matchId); if (!node) return;
//   setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2,
//             { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS });
//   options?.onFocused?.(matchId);
```

```ts
// src/components/roadmap/FocusMatchButton.tsx
interface FocusMatchButtonProps {
  /** Resolved target id, or null when every match has ended (button disabled). */
  targetMatchId: string | null;
  /** True when the resolved target is currently live (live affordance/label). */
  isLive: boolean;
  /** Fired with the non-null targetMatchId when the user activates the control. */
  onActivate: (matchId: string) => void;
}
```

`RoadmapCanvas` derives the target immutably:

```ts
const focusTarget = useMemo(() => {
  const matches = tournament?.matches ?? [];
  const id = pickFocusMatchId(matches, Date.now());
  const isLive = id != null && matches.some((m) => m.id === id && m.status === 'live');
  return { id, isLive };
}, [tournament]);
```

## Test Strategy

### Unit — `focus-target.test.ts` (primary target of TDD)
Build small fixed `Match[]` fixtures (reuse `makeMatch`-style minimal objects or the `roadmap-fixtures` loader) and a fixed `nowMs`:
- **Live wins over later scheduled:** a live match (kickoff just before now) and a later-kickoff scheduled match → returns the live match id (its estimatedEnd is nearest in the future).
- **Nearest upcoming when none live:** several future-kickoff matches, none live → returns the one with the smallest kickoff (smallest estimatedEnd).
- **Null when all ended:** every match's `kickoff + MATCH_DURATION_MS <= now` → returns `null`.
- **Boundary at exactly now:** a match whose `estimatedEnd === now` is **excluded** (rule is `estimatedEnd > now`); a match whose `estimatedEnd === now + 1ms` is included.
- **Kickoff tiebreak:** two candidates with identical estimatedEnd (same kickoff) but different ids → the smaller id wins **only after** kickoff tie; construct equal kickoff to exercise the id tiebreak, and different kickoff/same end is impossible (end = kickoff + const) so kickoff-tie implies end-tie.
- **Id tiebreak:** two candidates, identical kickoff → lexicographically smaller id wins.
- **Empty input:** `[]` → `null`.
- **Immutability:** `deepFreeze` the input array + elements (reuse helper) and assert no throw and input unchanged; also assert the same array reference is not reordered (no in-place sort).
- **Determinism/O(n):** repeated calls with same args return the same id; single pass (no nested scan) — asserted indirectly via behavior, documented in code.

### Hook — `useFocusMatch.test.tsx` (jsdom)
- Mock `useReactFlow` to return `getNode` (yielding a node at a known position) and a spied `setCenter`. Assert `focusMatch('m1')` calls `setCenter` with `x + NODE_W/2`, `y + NODE_H/2`, `{ zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS }` and fires `onFocused('m1')`.
- `getNode` returns undefined → `setCenter` not called, `onFocused` not called (no dead move).
- `focusMatch` identity is stable across re-renders.

### Component — `FocusMatchButton.test.tsx` (jsdom, inside `ReactFlowProvider`)
- Renders a real `<button>` (semantic) with an accessible name.
- `aria-label` reads "Go to live match" when `isLive`, "Go to current match" otherwise.
- `disabled` when `targetMatchId` is null; enabled otherwise.
- Click invokes `onActivate(targetMatchId)` exactly once with the resolved id.
- Keyboard activation (Enter/Space) invokes `onActivate`.
- When disabled, click does not invoke `onActivate`.
- Live state applies the live-accent class/affordance (assert via class or a data attribute, not pixels).

### Regression
- All existing tests stay green (`build-graph`, layout, toggles, hooks). No shared module is modified except `RoadmapCanvas` (no test asserts its internal markup of the new button) and `vitest.config.ts` (include-only addition).

### Coverage
- Target >= 80% across the three new production files (added to coverage `include`). `pickFocusMatchId` and `FocusMatchButton` reach ~100% branch coverage; `useFocusMatch` covers the found / not-found branches.

### Acceptance verification commands
- `npm run test` (vitest) — all green incl. new specs.
- `npm run typecheck` (tsc --noEmit) — clean.
- `npm run build` (vite) — succeeds.
- e2e (`npm run test:e2e`) — **optional/documented**; not authored here because Playwright browsers may be unavailable in CI.

## Risks & Open Questions

- **`MATCH_DURATION_MS` justification:** 115 min = 2×45 regulation + 15 half-time + ~10 stoppage cushion. The rule only needs live matches to end "soon" relative to scheduled ones; any value in the ~100–130 min range yields identical selection behavior for non-overlapping fixtures. Documented in code; value is a named constant, not a magic number.
- **Live match that has actually run long:** a `status: 'live'` match whose `kickoff + 115min < now` would be excluded as "ended". This is acceptable and matches the literal estimatedEnd rule; the next not-yet-ended match becomes the target. Noted, not handled specially (avoids special-casing status over the owner's pure-time rule). If the owner prefers "a live match always wins regardless of estimatedEnd," that is a one-line guard — flagged as an open question below.
- **Node availability at click time:** `getNode(matchId)` may be momentarily undefined before React Flow registers nodes; `useFocusMatch` no-ops safely (covered by a test). The button is only enabled once a target exists, and graph nodes exist whenever matches do.
- **Panel placement / overlap:** the canvas already uses top-left (StageToggle), top-right (Legend), bottom-left (Controls), bottom-center (InteractionModeToggle). Plan: place the button `top-right` stacked above the Legend within its own `<Panel>` (or `top-center`) to avoid collision. Final position is a visual nit, not a logic risk.
- **Open question (non-blocking):** Should a `status: 'live'` match *always* win even if its estimatedEnd is in the past (i.e., prefer status over the pure time rule)? Current plan follows the literal estimatedEnd rule. Default chosen; trivially adjustable.

## Acceptance Criteria

1. `pickFocusMatchId(matches, nowMs)` is pure (no clock read, no input mutation), O(n), and returns the candidate with the minimum `estimatedEnd` among matches with `estimatedEnd > now`, tiebreaking by kickoff then matchId.
2. Given a live match and a later scheduled match, `pickFocusMatchId` returns the live match's id.
3. Given only future matches and none live, it returns the earliest-kickoff match's id.
4. When every match's `estimatedEnd <= now`, it returns `null`.
5. A match whose `estimatedEnd` equals `now` exactly is excluded; one at `now + 1ms` is included.
6. `MATCH_DURATION_MS`, `FOCUS_ZOOM`, and `FOCUS_DURATION_MS` are named exported constants (no inline magic numbers); `FOCUS_ZOOM` lies within the canvas `minZoom`/`maxZoom` bounds.
7. `FocusMatchButton` renders a single semantic `<button>` with a lucide icon and a visible focus state using Tailwind tokens.
8. The button's `aria-label` is "Go to live match" when the target is live and "Go to current match" otherwise.
9. The button is `disabled` (no dead click) when `targetMatchId` is null; activating it otherwise calls `onActivate` once with the resolved matchId, via both pointer and keyboard.
10. On activation `RoadmapCanvas` focuses the camera on the resolved match node via `setCenter(node.x + NODE_W/2, node.y + NODE_H/2, { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS })` and selects that node; if the node is not found the camera does not move.
11. The new production files are listed in `vitest.config.ts` coverage `include`; combined coverage for them is >= 80%.
12. `npm run test`, `npm run typecheck`, and `npm run build` all pass, and no pre-existing test regresses.
