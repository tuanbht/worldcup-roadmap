# Requirement: `?focus=` query frames the camera on cold load

## Context
The app supports a `?focus=` deep link (e.g. `/?focus=knockout`, `?focus=groups`, `?focus=all`, or a match id)
that moves the camera to a target. During `2026-06-23-1336-mobile-friendly-small-screens` review/live-verify we
confirmed a **pre-existing gap**: on a **cold page load**, `?focus=…` does **not** frame the camera to the
target — the default first-load fit runs instead, and the focus only takes effect when the user later clicks a
stage tab. (Verified pre-existing: stashing the 1336 camera changes reproduced identical cold-load transforms,
so 1336 did not introduce it.)

## Want
When the page is loaded **cold with a `?focus=` param**, the camera frames that target **once on first load**,
instead of the generic default fit. Without the param, first load behaves exactly as today (default top-aligned
fit). After first load, normal rules apply.

## Decision
- **Honor `?focus=` on the initial frame.** On first non-empty data arrival, if a `?focus=` target is present
  and resolvable, the one-time auto-frame targets it (not the default fit). If absent/unresolvable, fall back to
  the current default first-load fit.
- **Still frame only once.** This must compose with the fit-once semantics — the cold-load focus frame is the
  single automatic frame; **refetches never re-frame** (see Dependency below). Explicit fit ("F" / control /
  `FocusMatchButton`) keeps working on demand.
- Desktop ≥1024 default (no-param) framing stays **byte-identical**; this only changes the *param-present*
  cold-load path.

## ⚠️ Dependency / sequencing (IMPORTANT)
This requirement modifies `src/features/roadmap/hooks/useFocusCamera.ts` and `useFitOnChange.ts` — the **same
files** as the in-flight `2026-06-24-0951-preserve-viewport-on-refetch`. **Do not build this until
`preserve-viewport-on-refetch` is committed and archived (`.deleted.md`).** Build on its final fit-once /
`hasFramedRef` design rather than re-deriving it — the cold-load focus frame must be the *one* automatic frame
that fit-once allows, and must not reintroduce refetch re-framing. The planner must re-read the
`preserve-viewport-on-refetch` implementation (its commit) before planning, and the implementer must rebase
this onto the then-current camera-hook code.

## Acceptance criteria (testable)
- Cold-load `/?focus=knockout` (and `groups` / `all` / a match id): after first load the `.react-flow__viewport`
  transform frames the requested target (distinct from the default no-param fit) — asserted in a test.
- Cold-load with **no** `?focus=` param frames exactly as today (default top-aligned fit) — regression-guarded.
- The cold-load focus frame is **one-time**: a subsequent refetch does NOT re-frame (composes with
  `preserve-viewport-on-refetch`'s fit-once); explicit fit still works on demand.
- Unresolvable/garbage `?focus=` value falls back to the default fit without error.
- Desktop ≥1024 default framing byte-identical. `npm run typecheck` + `npm test` + `npm run build` green; visual
  suite stays deterministic.

## Files (indicative)
- `src/features/roadmap/hooks/useFocusCamera.ts`, `src/features/roadmap/hooks/useFitOnChange.ts`
  (cold-load focus vs. default fit, composed with fit-once)
- `src/components/roadmap/RoadmapCanvas.tsx` (wiring), the `?focus=` URL-state reader (e.g. `useStageView` /
  `focus-target.ts`)
- tests: a refetch/cold-load integration test alongside the `preserve-viewport-on-refetch` suite; `e2e/` if a
  live deep-link frame is worth pinning

## Notes
Lowest-priority of the 1336 follow-ups and the one with a hard dependency — intentionally timestamped last so it
is picked up **after** the camera refetch work lands.

Owner: **wc-graph-engineer** (camera/fit hooks) + **wc-test-engineer**.
