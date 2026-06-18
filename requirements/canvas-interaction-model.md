# Requirement decision record: Canvas interaction model (zoom/pan) + layout supersession

> **Status: RESOLVED** — 2026-06-18. §1 is resolved by **"both modes + toggle"** (see the
> Decision box below); §2 is a factual cross-reference now actioned. This record is kept
> intact (the conflict, the options, the analysis) as the decision history — only the
> resolution is added.

## Decision (§1) — RESOLVED: support BOTH modes behind a persisted toggle

The owner rejected the binary A-or-B framing and chose to **ship both interaction models with a
user-facing, persisted toggle**, rather than forcing all users onto one ergonomic.

- **Default mode = `'zoom'`** (Option A) — honors the written hard requirement in
  `zoomable-roadmap-graph.md`: a plain mouse wheel zooms (cursor-centered, clamped to
  `minZoom=0.2`/`maxZoom=1.8`), drag pans (React Flow defaults `zoomOnScroll` + `panOnDrag`,
  `panOnScroll` OFF).
- **Alternate mode = `'pan'`** (Option B) — two-finger / plain scroll pans (`panOnScroll`);
  zoom via ⌘/Ctrl+scroll (`zoomActivationKeyCode: ['Meta','Control']`) and pinch (`zoomOnPinch`).
- **A persisted toggle** (key `wc-roadmap:interaction-mode` in `localStorage`, **not** the URL —
  it is a per-device ergonomic preference, not shareable view state) switches modes. It is
  surfaced in the canvas inside a React Flow `<Panel>` reusing the accessible `SegmentedControl`
  (a `role="tablist"` of two `role="tab"`s, keyboard-operable, `aria-label`) and shows a short
  active-affordance hint ("Scroll to zoom" vs. "Scroll to pan · ⌘-scroll to zoom").

**Implementation:**

- `src/features/roadmap/interaction-mode.ts` — pure mode → React Flow prop mapping plus an
  SSR-safe storage read/write.
- `src/features/roadmap/hooks/useInteractionMode.ts` — mode state with `localStorage` persistence,
  no-window/throw safe.
- `src/components/roadmap/InteractionModeToggle.tsx` — Panel + SegmentedControl + active-affordance
  hint, wired in `src/components/roadmap/RoadmapCanvas.tsx`.

The `zoomable-roadmap-graph.md` wheel-zoom requirement is reworded to "default wheel-zoom, with a
toggle to scroll-pan"; `e2e/wheel-zoom.spec.ts` covers both modes + persistence. The old
"plain wheel does _not_ zoom" assertion is gone — spec and code now agree.

## 1. Wheel zoom vs. `panOnScroll` (RESOLVED — record of the original conflict)

### The conflict

- `zoomable-roadmap-graph.md` states a **HARD requirement** (lines 16, 99, 132):
  _"smooth mouse-**wheel** zoom (cursor-centered, clamped) — scroll wheel zooms, drag pans"_,
  and explicitly lists `panOnScroll` only as the **optional alternative it did not choose**.
- The implementation does the opposite: `src/components/roadmap/RoadmapCanvas.tsx:92` sets
  `panOnScroll` (no `zoomOnScroll`). Verified against `@xyflow/system` source: under `panOnScroll`
  a plain wheel **pans**; zoom is reachable only via `ctrl`/`⌘`+scroll or pinch.
- `e2e/wheel-zoom.spec.ts` previously **encoded** this (asserted "a plain wheel does _not_ zoom").
  As of the resolution it is rewritten to cover both modes + persistence, so the suite no longer
  blocks the spec'd default behavior.

This was flagged HIGH in two prior reviews. It is now **resolved** by "both modes + toggle"
(see the Decision box above) — the deliberate UX choice is preserved as the alternate `'pan'`
mode, while the written hard requirement is honored as the `'zoom'` default.

### Option A — honor the original spec (wheel zooms)

- Remove `panOnScroll` → React Flow defaults (`zoomOnScroll` + `panOnDrag`) give cursor-centered
  wheel zoom and drag-to-pan. Update `wheel-zoom.spec.ts` to assert a plain wheel **does** zoom.
- Pros: meets the hard requirement; "Google-Maps / Figma scroll-to-zoom" feel as originally written.
- Cons: trackpad two-finger scrolling zooms (can feel twitchy on laptops).

### Option B — adopt the trackpad-first model (amends the spec)

- Keep `panOnScroll` (two-finger scroll pans) and add an explicit, documented zoom affordance
  (`⌘`/`Ctrl`+scroll and pinch). Keep the e2e as-is.
- Pros: modern app feel; better on trackpads.
- Cons: a plain mouse wheel pans, not zooms — this **changes the hard requirement**, so
  `zoomable-roadmap-graph.md` lines 16/99/132 must be amended to make `panOnScroll` the chosen model
  and document the `⌘`/`Ctrl`+scroll / pinch zoom path (and surface it in the UI hint).

### Recommendation

If the audience is mostly **mouse** users, choose **A** (it matches the literal requirement and is a
one-line code change + test rewrite). If mostly **trackpad/laptop**, choose **B** and amend the spec
here so spec and code agree. Either way, the spec and the e2e must end up consistent — today they are not.

## 2. Layout model supersession (factual cross-reference)

`zoomable-roadmap-graph.md` describes a **family-tree / bracket** visual. The current direction is the
**timeline-grid** model (shared day rail + fixed group columns + center-converging knockout funnel),
specified in `docs/pipeline/timeline-grid-layout/plan.md` (Rev2). The `library-first-stack-policy.md`
already noted that `zoomable-roadmap-graph.md` predates later decisions and should be updated.

**Action (DONE — 2026-06-18):** `zoomable-roadmap-graph.md`'s "Architecture / layout" section now
points at `docs/pipeline/timeline-grid-layout/plan.md` as the authoritative visual model. The
**hard requirements that still apply** (smooth zoom/pan, `fitView` on load, minimap/controls,
semantic-zoom LOD, a11y, budgets) carry over unchanged — only the node arrangement changed.
