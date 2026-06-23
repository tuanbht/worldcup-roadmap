# Requirement: Legend on its own line on small screens (stop overlapping the groups)

## Bug
The status `Legend` (Live / Finished / Upcoming + "Live data · FIFA") renders as a floating
`<Panel position="top-right">` in `RoadmapCanvas.tsx` (line 195–197). On small screens it crowds the view
toggle and **overlaps the group columns** beneath it.

## Want
On small screens the legend must sit on its **own separate line** (full-width row, not floating top-right), so
it doesn't overlap the canvas content / group cards. Desktop layout unchanged.

## Decision
- Below a small breakpoint (≈`max-[640px]`), move the legend out of the `top-right` overlay onto its **own
  horizontal line** — e.g. a top-anchored full-width band under the view toggle (or relocate it into the
  `App.tsx` header as a separate wrapped row). Give the canvas headroom so the first group row starts below it.
- Keep the chips wrapping cleanly; keep the `bg-surf-1/80 backdrop-blur` so it reads as chrome.
- At ≥`sm` keep the current floating `top-right` Panel.

## Acceptance criteria (testable)
- At 320 / 375 / 640 widths the legend is on its own line and does **not** overlap the view toggle or any group
  node; the first group cards are fully visible (not occluded by the legend).
- At ≥1024 the legend stays in its current top-right position (no desktop regression).
- `npm run typecheck` + `build` green; mobile visual snapshot updated.

## Files
- `src/components/roadmap/RoadmapCanvas.tsx` (the `Legend` Panel placement) and/or `src/App.tsx` if relocated to
  the header; `src/styles/global.css` if needed → **wc-ui-engineer**; snapshots → **wc-test-engineer**.

> Focused slice of the broader `2026-06-23-1336-mobile-friendly-small-screens.md` (header/legend stacking);
> implement consistently with it.
