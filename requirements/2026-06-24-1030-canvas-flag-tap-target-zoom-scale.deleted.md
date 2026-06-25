# Requirement: Canvas flag tap target stays ≥44px under the React Flow zoom transform

## Context

`2026-06-23-1336-mobile-friendly-small-screens` added ≥44×44 coarse-pointer hit areas to flags, tabs, and
close buttons. The unit tests assert the **un-transformed** bounding box, so they pass. But the standings-row
flag button rendered **inside the canvas** lives under `.react-flow__viewport { transform: scale(zoom) }`. At
the mobile zoom floor (`MOBILE_MIN_ZOOM = 0.32`, see `src/features/roadmap/responsive.ts`) on a 320px screen,
its **on-screen** tap target is `44 × 0.32 ≈ 14px` — below the 44px touch-target minimum. This was caught by
the 1336 live-verify stage (the gap unit tests structurally cannot see) and shipped as a known LOW follow-up.

This is **canvas-only**: flags in the DOM overlays (the match-detail panel, the `StandingsOverlay` dialog) are
NOT inside the scaled viewport and are already a genuine ≥44px on-screen — leave them unchanged.

## Decision

- **Counter-scale the canvas flag's hit area by `1/zoom`** so its effective on-screen tap target is ≥44px
  regardless of the current zoom. Use the live zoom level (e.g. the existing `useZoomLevel`/React Flow viewport
  scale) to size a `1/zoom`-scaled hit slop around the (visually unchanged) flag glyph. The glyph itself stays
  its current rendered size; only the invisible tap area grows.
- **Alternative to evaluate during planning:** if the canvas standings-row flag has **no tap action** (purely
  decorative — confirm against the code), the correct fix is to make it a non-interactive element (not a
  `button`) rather than enlarge a dead hit area. The planner must determine whether this flag is interactive
  and choose: counter-scale (if it does something) vs. de-interactive (if it does nothing). Do not ship a
  44px dead zone.
- Desktop (≥1024) and the DOM-overlay flags stay **byte-identical** — scope is the canvas flag only.

## Acceptance criteria (testable)

- At 320px on the mobile/coarse-pointer path, the canvas standings-row flag's **post-transform on-screen**
  bounding box (`getBoundingClientRect`, which includes the viewport scale) is **≥44×44** — OR, if the flag is
  decorative, it is not an interactive control (no `button`/`role`, not tab-focusable) and the requirement is
  satisfied that way.
- The flag **glyph** is visually unchanged at all zoom levels (only the hit area is counter-scaled).
- A test pins the transformed contract that unit tests missed: a Playwright/e2e assertion on the live
  `getBoundingClientRect()` at 320px (mirroring the deterministic patterns already in `e2e/visual.spec.ts`), or
  an integration test that accounts for the zoom transform — not just the un-transformed `offsetWidth`.
- DOM-overlay flags and desktop ≥1024 are unchanged. `npm run typecheck` + `npm test` + `npm run build` green;
  the visual suite stays deterministic (no new flake).

## Files (indicative)

- `src/components/nodes/GroupTableNode.tsx` (the canvas standings-row flag) and/or `src/components/**/Flag*`
- the live zoom source (`src/features/roadmap/hooks/useZoomLevel.ts` or the React Flow viewport scale)
- `e2e/visual.spec.ts` (transform-aware bounding-box assertion at 320px)

## Notes

Independent of the in-flight `2026-06-24-0951-preserve-viewport-on-refetch` (that touches the camera/fit hooks;
this touches the canvas flag hit area). No file overlap expected.

Owner: **wc-ui-engineer** (canvas flag) + **wc-test-engineer** (transform-aware e2e).
