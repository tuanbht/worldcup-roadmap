# Implementation Review — Library-first stack policy (post-Vite-migration)

**Verdict: APPROVED** — no CRITICAL or HIGH issues; all gates pass.

## Summary

The implementation faithfully executes the post-migration plan. The remaining library-first work
(date-fns + date-fns-tz funnel, d3-hierarchy dependency + smoke test, lucide-react icon swap,
user-event/Testing Library component test, Prettier + tailwind plugin, framer-motion deferral, doc
updates) is complete, surgical, and standards-clean. All kickoff/timezone rendering now routes through a
single `src/lib/datetime.ts` façade over `date-fns-tz`; no hand-rolled `Intl` date formatting remains.
Domain non-goals are untouched (changes to domain/mock files are pure Prettier reflow, no logic edits).
No duplicate-concern libraries. All automated gates (typecheck, test+coverage, build, format:check) and
the full Playwright suite (visual, roadmap, a11y) pass.

## Observed gate results (run by reviewer)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| Unit/component tests | `npm run test:coverage` | PASS — 12 files, **109 tests**, 0 fail |
| Coverage (target module) | v8 | `src/lib/datetime.ts` **100%** stmts/branch/funcs/lines (≥80% met); overall 93.4% |
| Build | `npm run build` (Vite) | PASS — built in ~1s; SPA JS 71KB gz + lazy canvas 79.75KB gz |
| Format | `npm run format:check` (`prettier --check .`) | PASS — "All matched files use Prettier code style" |
| E2E visual | `playwright test e2e/visual.spec.ts --project=chromium` | PASS — 8/8 (UTC snapshots match new render) |
| E2E roadmap+a11y | `playwright test e2e/roadmap.spec.ts e2e/a11y.spec.ts` | PASS — 6/6 incl. axe (no serious/critical) |

## Acceptance criteria verification

1. **Date façade / no Intl** — `src/lib/datetime.ts` wraps `parseISO` + `formatInTimeZone` against default
   `'UTC'`; `format.ts` is a thin barrel; all three consumers (`MatchNode`, `StatusPill`,
   `MatchDetailPanel`) import from it. Grep: zero `Intl.DateTimeFormat`/`toLocale*` date formatting in
   `src/` (only doc-comment mentions). PASS.
2. **Intentional kickoff-format change** — unit golden strings assert the explicit-zone path (UTC, NY,
   Tokyo incl. a midnight-crossing case); the four committed desktop snapshots match under
   `timezoneId: 'UTC'` + `locale: 'en-US'` (visual suite green). PASS.
3. **d3-hierarchy dep-only** — `d3-hierarchy` + `@types/d3-hierarchy` present; `d3-hierarchy.smoke.test.ts`
   proves install/type-resolution (leaves/height/depth/descendants); no `bracketHierarchy`/
   `d3-bracket-adapter` wrapper; no dagre dep; d3-hierarchy is imported only in the test. PASS.
4. **lucide-react icon** — the `✕` glyph is replaced by `<X aria-hidden size={16} />`; the button keeps
   `aria-label="Close match details"`; grep finds no inline icon glyphs/SVGs in `src/` (the `✕` only
   survives in test comments/assertions). PASS.
5. **user-event + Testing Library on jsdom** — `@testing-library/user-event` added and used
   (`userEvent.click`); component test uses the per-file `// @vitest-environment jsdom` pragma;
   `vitest.setup.ts` registers `jest-dom/vitest` + `afterEach(cleanup)` via `setupFiles` without changing
   the global `node` environment; the node domain suite stays green. PASS.
6. **framer-motion deferred** — not added; panel keeps the compositor-only CSS `transition-transform` +
   `inert`/`aria-hidden`/`aria-label` contract; `e2e/roadmap` and `e2e/a11y` green. Policy row marked
   "deferred — no consumer". PASS.
7. **Prettier + tailwind plugin** — `prettier@3.4.2` + `prettier-plugin-tailwindcss@0.6.11` added with a
   `.prettierignore` and `format`/`format:check` scripts; `format:check` passes. PASS (see LOW-1 on
   config location).
8. **Single-concern / migration rows intact** — exactly one date lib (date-fns + date-fns-tz; no
   luxon/moment/dayjs); native fetch behind TanStack Query (no axios/ky); Vite+Hono / TanStack Query /
   Tailwind v4 / Testing Library not duplicated or undone. PASS.
9. **Tailwind-only styling** — `src/styles/global.css` (`@import 'tailwindcss'` + `@theme`) is the sole app
   stylesheet; no styled-components/emotion/vanilla-extract; no second `.css`/`.scss`. PASS.
10. **Coverage / build** — `datetime.ts` 100%; d3 work ships no production module; suite green; typecheck
    + Vite build pass. PASS.
11. **Docs** — `requirements/zoomable-roadmap-graph.md` updated (Dagre→d3-hierarchy, Tailwind v4 `@theme`,
    TanStack Query, date-fns/date-fns-tz, Vite+React+Hono framework note); `library-first-stack-policy.md`
    stack map matches post-migration reality with the framer-motion row "deferred — no consumer"; no row
    implies active Next.js (all are "superseded"/"was"/"removed"). PASS.
12. **Domain untouched** — `mulberry32`, `drawGoals`, `decide`, `R32_SEEDING`, stage-order, standings,
    bracket topology, and the `iso()` instant builder are unchanged. The diffs to `build-mock-tournament.ts`,
    `build-bracket.ts`, `domain/types/index.ts`, and `standings.test.ts` are **pure Prettier reflow**
    (import-collapsing / line-wrapping), no logic change. PASS.

## Quality notes

- `src/lib/datetime.ts` (65 lines): explicit boundary guards (null/empty/whitespace/unparseable → typed
  fallback, never throws into render); pure, no React/ambient clock; no `any`, no mutation; small focused
  helpers. Good.
- Tests meaningfully constrain behavior: cross-zone divergence + a midnight-crossing case prove a *real*
  tz conversion rather than a string slice; the panel test asserts the icon is an `aria-hidden` SVG (not a
  glyph) and the kickoff row renders the deterministic UTC text. Not weakened to pass.
- `enUS` locale is pinned in the façade (a sensible addition beyond the plan's letter) so month
  abbreviations are deterministic regardless of runner locale — strengthens the determinism goal.
- No `console.*` in `src/`/`server/` (excluding tests). No hardcoded secrets. Compositor-only animation
  preserved (panel `transform`, live-pulse `[will-change:transform,opacity]`).

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

- **LOW-1 — Prettier config in `package.json` rather than `.prettierrc`** (`package.json` `"prettier"` key).
  The plan listed `.prettierrc` as a `create` action; the implementer inlined the equivalent config
  (`singleQuote`, `semi`, `printWidth: 100`, `plugins: [prettier-plugin-tailwindcss]`) into `package.json`.
  This is a fully supported Prettier config location, `format:check` passes, and the acceptance criterion
  ("Prettier + plugin with config + scripts") is satisfied. Purely a deviation from the plan's letter, not
  its intent. No action required; note only.

- **LOW-2 — `jest-dom` double-registration (harmless)** (`MatchDetailPanel.test.tsx:18` +
  `vitest.setup.ts:6`). The component test imports `@testing-library/jest-dom/vitest` directly *and* the
  shared `setupFiles` registers it; likewise `afterEach(cleanup)` runs in both. Idempotent and harmless
  (the test's own header comment acknowledges the lines can be removed now that the shared setup exists).
  Optional tidy-up.
