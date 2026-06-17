# Requirements Conformance Review — wc-roadmap

**Reviewed:** 2026-06-17 · **Mode:** local (no PR) · **Scope:** whole project vs `requirements/`
**Decision:** 🟠 **REQUEST CHANGES** — 1 HIGH functional gap + several MEDIUM library-policy gaps. No CRITICAL/security issues.

## Summary

The project is the **correct project**: `library-first-stack-policy.md` is the single source of truth and
explicitly embraces the World Cup domain (it references `computeGroups`, `buildBracket`, `R32_SEEDING`, the
mock simulator, "mock has a live Final"). The older `zoomable-roadmap-graph.md` is superseded by the policy
(Dagre → d3-hierarchy, add Tailwind/TanStack Query/tz lib).

Core build is healthy (typecheck/tests/build green, 104 kB landing < budget, domain logic correctly
hand-written per _Non-goals_, Tailwind is the single styling system). But several **mapped library concerns
were hand-rolled** against the policy's acceptance criteria, and one **hard functional requirement
(mouse-wheel zoom) is broken**.

## Conformance matrix (canonical stack map)

| Concern                | Required                            | In repo                                | Verdict                        |
| ---------------------- | ----------------------------------- | -------------------------------------- | ------------------------------ |
| Framework              | Next.js 15                          | Next 15                                | ✅                             |
| Language               | TypeScript 5                        | ✅                                     | ✅                             |
| Styling                | Tailwind v4 `@theme`, no 2nd system | Tailwind v4, bespoke CSS removed       | ✅ (tokens hex not oklch → M7) |
| Validation             | Zod at boundaries                   | `parseTournament`, `env.ts`            | ✅                             |
| Graph canvas           | React Flow                          | `@xyflow/react` used                   | ✅ (wheel-zoom broken → H1)    |
| Bracket layout         | **d3-hierarchy**                    | hand-rolled `bracket-layout.ts`        | ⚠️ M3                          |
| Server state / polling | **TanStack Query**                  | hand-rolled `fetch`+`setInterval`      | ⚠️ M1                          |
| Date/timezone          | **date-fns(-tz)**                   | native `Intl` only                     | ⚠️ M2                          |
| Images / flags         | **next/image**                      | plain `<img>`                          | ⚠️ M4                          |
| Unit/component tests   | Vitest + **Testing Library**        | Vitest only, no component tests        | ⚠️ M5                          |
| Lint / format          | ESLint(config) + **Prettier**       | no ESLint config, no Prettier          | ⚠️ M6                          |
| Icons                  | lucide-react                        | none (`✕` glyph)                       | 🔵 L1                          |
| E2E                    | Playwright                          | added                                  | ✅                             |
| Fonts                  | next/font                           | Archivo/Inter swap                     | ✅                             |
| next/image hosts       | remotePatterns                      | FIFA hosts locked                      | ✅                             |
| URL state              | nuqs (if needed)                    | hand-rolled `history`                  | 🔵 L3                          |
| UI animation           | Framer Motion (sparingly)           | CSS only                               | 🔵 L4                          |
| Domain logic           | hand-written (Non-goal)             | computeGroups/buildBracket/seeding/sim | ✅ correct                     |

## Findings

### HIGH

- **H1 — Hard requirement "scroll-to-zoom" is broken.** `src/components/roadmap/RoadmapCanvas.tsx:91`
  sets `panOnScroll`, which makes the mouse wheel **pan**, not zoom. `zoomable-roadmap-graph.md` lines 16/99/109
  mandate the _default_ mode (wheel zooms, drag pans) and explicitly mark `panOnScroll` as the **optional Figma
  alternative they did NOT choose**. Fix: remove `panOnScroll` (default `zoomOnScroll` gives cursor-centered
  wheel zoom), keep `zoomOnPinch`. Also set `nodesDraggable={false}` per spec line 102 (viewer; layout authoritative).

### MEDIUM (policy: hand-rolling a mapped concern → MEDIUM)

- **M1 — Client fetch/polling hand-rolled, not TanStack Query.** `src/features/roadmap/hooks/useTournament.ts`
  uses `fetch` + `setInterval`. Violates acceptance criterion "No bespoke fetch/caching layer — client data
  fetching/polling uses TanStack Query" (policy l.66; map l.28). Keep the server route + TTL cache; wrap the
  _client_ poll in `useQuery({ refetchInterval })`.
- **M2 — Date/timezone formatting hand-rolled with `Intl`.** `src/features/roadmap/format.ts`. Violates
  "No hand-rolled date/timezone formatting — all kickoff rendering goes through the tz lib" (policy l.65; map l.31).
  Kickoffs are ISO-UTC; render via `date-fns` + `date-fns-tz` through one path.
- **M3 — Bracket layout hand-rolled, not d3-hierarchy.** `src/features/roadmap/layout/bracket-layout.ts`.
  Map l.34 maps this concern to `d3-hierarchy`. Topology (`buildBracket`) being hand-written is correct
  (Non-goal), but _positioning_ is mapped. A mirrored-convergent bracket isn't `d3.tree`'s default shape, so a
  deviation may be justifiable — but the policy requires the justification be made in review; it isn't documented.
- **M4 — Flags use `<img>`, not next/image.** `src/components/ui/Flag.tsx:35`. `next.config.ts` already declares
  the FIFA `remotePatterns` (infra is set up but unused). Switch for optimization/lazy-loading (map l.43).
- **M5 — No component tests / Testing Library.** Only pure-logic Vitest tests exist. Acceptance: "Unit/component
  tests use Vitest + Testing Library" (l.68; map l.39). Add `@testing-library/react` + a couple of node tests
  (e.g. `MatchNode` status states, `StatusPill`).
- **M6 — Lint/format not configured.** `next lint` prompts to set up (no ESLint config present), and **Prettier**
  (+ `prettier-plugin-tailwindcss`) is absent (map l.26/41). Note: a config-protection hook blocked creating
  `eslint.config.mjs` during the build — needs the user to unblock or add config another way.
- **M7 — Tokens are hex/rgb, not oklch.** `src/app/globals.css` (0 `oklch`). Policy l.26/55 + zoomable §6 call for
  an oklch palette in `@theme`. Functionally fine; not to spec.

### LOW

- **L1** lucide-react not used (close button is a `✕` glyph) — map l.35.
- **L2** Semantic zoom / LOD (zoomable §5, _recommended_) not implemented — node detail is constant across zoom.
- **L3** `?view=` URL state hand-rolled (`useStageView`) instead of nuqs — "if needed", optional.
- **L4** Framer Motion not used — "sparingly", optional; CSS animations are compositor-friendly already.
- **L5** Dead dep: `tsx` in devDependencies is unused (the `gen:fixture` script was removed). Remove it.
- **L6** `requirements/zoomable-roadmap-graph.md` still says Dagre + bespoke CSS; the policy's own follow-up
  (l.78–80) asks to update it to d3-hierarchy/Tailwind/TanStack Query/tz lib.

## Validation

| Check                       | Result                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| Type check (`tsc --noEmit`) | ✅ Pass                                                            |
| Unit tests (Vitest)         | ✅ Pass (20/20)                                                    |
| Build (`next build`)        | ✅ Pass (104 kB landing < 300 kB budget)                           |
| Lint (`next lint`)          | ❌ Not configured (no ESLint config)                               |
| E2E (Playwright)            | ⚠️ Spec present; browsers not installed (`npx playwright install`) |

## What matches well

Next 15 + TS · Tailwind v4 `@theme` as the single styling system (bespoke CSS removed) · Zod at every boundary ·
React Flow canvas + minimap + controls + fitView · domain logic hand-written exactly per _Non-goals_
(`computeGroups`, `buildBracket`, `R32_SEEDING`, `stage-order`, `mulberry32`/`drawGoals`/`decide`) · next/font ·
FIFA `remotePatterns` · Playwright added · a11y labels + `prefers-reduced-motion` · no duplicate libraries · JS budget.

## Recommended fix order

1. **H1** — remove `panOnScroll`, add `nodesDraggable={false}` (one-line; restores the headline requirement).
2. **M1/M2** — adopt TanStack Query (client poll) + date-fns-tz (kickoff rendering) — the two explicit acceptance-criteria gaps.
3. **M4** — `next/image` flags · **M5** — Testing Library + component tests · **M6** — ESLint config + Prettier.
4. **M3/M7/L\*** — justify or port the bracket layout to d3-hierarchy; oklch tokens; minor cleanups.
