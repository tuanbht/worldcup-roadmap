# Plan Review: Library-first stack policy (post-Vite-migration)

**Reviewer:** Plan Reviewer (stage 2)
**Date:** 2026-06-17
**Plan:** `docs/pipeline/library-first-stack-policy/plan.md`
**Requirement:** `requirements/library-first-stack-policy.md`
**Verdict:** APPROVED

## Summary

This is a tightly-scoped, post-migration re-plan that I verified claim-by-claim against the live,
migrated codebase. Every load-bearing assertion the plan makes — file paths, line numbers, grep
results, config shapes — checks out against the real tree. The plan correctly recognizes the
already-done migration work (Next→Vite+Hono, TanStack Query client fetch via
`useTournamentQuery.ts`, Tailwind v4, Testing Library/jsdom) and does **not** re-do any of it. The
remaining library-first scope (date-fns + date-fns-tz, d3-hierarchy dep + smoke test, lucide-react,
user-event, prettier + tailwind plugin, framer-motion deferral, doc updates) is complete, correctly
bounded, and respects the non-goals (domain logic stays hand-written).

> Note: this file overwrites an earlier review revision that referenced pre-migration artifacts
> (`useTournament.ts` setInterval hook, `layout.tsx`, `globals.css`, `@next/bundle-analyzer`,
> `RoadmapCanvas.tsx:64`). Those no longer reflect the migrated tree; the current `plan.md` is
> correctly written against the Vite+Hono reality and is what this review assesses.

### Verified against the codebase

- **No redo of migration work.** `package.json` already has `@tanstack/react-query`, `hono`,
  `@hono/node-server`, `tailwindcss@4`, `@testing-library/react`/`jest-dom`, `jsdom`, `vite`. The
  plan adds only the genuinely-missing libs and never touches `useTournamentQuery.ts`,
  `queryClient.ts`, or the provider wiring. Scripts are Vite-based (`build: vite build`,
  `test: vitest run`), matching the plan's verification commands.
- **Date refactor surface is exact.** `src/features/roadmap/format.ts` holds **exactly** the three
  `Intl.DateTimeFormat(undefined, …)` calls (`formatDateTime`/`formatTime`/`formatDate`); grep
  confirms no other `Intl` date usage in `src/`. The remaining `new Date(...)` hits are
  instant-construction in providers (mock `iso()` builder line 38, `fifa-repository.ts:28`,
  `mock-repository.ts:15`) — correctly excluded as non-display, non-goal.
- **Three consumers resolve correctly:** `MatchNode.tsx:5` (`formatDateTime`), `StatusPill.tsx:2,18`
  (`formatTime`), `MatchDetailPanel.tsx:5,117` (`formatDateTime`). All import from
  `@/features/roadmap/format`, so the barrel-re-export approach is genuinely call-site-churn-free —
  **provided the barrel re-exports all three names**, which the Files table does. (`formatDate` has
  no runtime consumer — see L1.)
- **Signature compatibility holds.** Existing call sites pass a single arg (`formatDateTime(data.kickoff)`,
  `formatTime(kickoff)`, `formatDateTime(match?.kickoff ?? null)`). The plan's `(iso, tz?)` optional-tz
  signature is backward-compatible — no call site breaks.
- **Icon swap is single-file and a11y-safe.** The `✕` glyph is at `MatchDetailPanel.tsx:95` and is the
  only icon glyph in `src/` (grep for `✕|✗|×|⨯` returns exactly that one line). The button's
  `aria-label="Close match details"` (line 92) is the accessible name, so a decorative
  `<X aria-hidden />` preserves the e2e/a11y contract. The `inert`/`aria-hidden` always-mounted panel
  contract (lines 71-83) is untouched.
- **Visual snapshots will genuinely shift and are regeneratable.** The four baselines exist exactly as
  named: `e2e/visual.spec.ts-snapshots/roadmap-{320,768,1024,1440}-chromium-darwin.png`.
  `visual.spec.ts` skips the `mobile` project (line 53) and masks `<img>` (line 81) but **not** kickoff
  text, which `MatchNode` (line 67) and `StatusPill` render — so the UTC refactor can change the
  pixels. Regeneration + human-review is warranted.
- **Other e2e specs stay green.** `roadmap.spec.ts` and `a11y.spec.ts` never read kickoff text and
  assert only on preserved accessible names/roles (`role=complementary` name "Match details",
  `article[aria-label]`, axe). The plan's "stays green" claim holds.
- **Single styling system confirmed.** `src/styles/global.css` is the **sole** app stylesheet; all
  other CSS is `node_modules` vendor (React Flow + @fontsource). No styled-components/emotion/sass.
- **Tooling state confirmed.** No root ESLint/Prettier config exists (only `node_modules` matches),
  consistent with the requirement's "no ESLint config remains; add Prettier." Adding only Prettier (not
  ESLint) is within this phase's scope.
- **Config/typecheck wiring resolves.** `tsconfig.json` maps `@/*`→`./src/*` and `include` covers
  `src/**/*.ts(x)`, `e2e/**/*.ts`, `playwright.config.ts`, `vitest.config.ts`, so `@/lib/datetime`, the
  new tests, and the config edits all typecheck. `src/lib/` currently holds only `queryClient.ts`.
  `vitest.config.ts` keeps `environment: 'node'` global + `env.WC_PROVIDER='mock'`, `include` covers
  `*.test.ts(x)`, and `useTournamentQuery.test.tsx` already uses the per-file
  `// @vitest-environment jsdom` pragma the plan reuses. The smoke-test name
  `d3-hierarchy.smoke.test.ts` matches the `*.test.ts` glob.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

- **M1 — `playwright.config.ts` override rationale is imprecise (outcome correct).** The plan says
  top-level `use.timezoneId`/`use.locale` "override the mobile project's `iPhone 13` descriptor."
  Playwright device descriptors (`devices['iPhone 13']`) carry `userAgent`, `viewport`,
  `deviceScaleFactor`, `isMobile`, `hasTouch`, `defaultBrowserType` — they do **not** set `timezoneId`
  or `locale`, so there is nothing to override; the top-level keys simply apply to all projects with no
  conflict. The end state (deterministic UTC/en-US) is correct; fix the justification so the
  implementer doesn't chase a non-existent conflict. Non-blocking.

### LOW

- **L1 — `formatDate` has no runtime consumer.** Grep shows only `formatDateTime` and `formatTime` are
  imported in `src/`; `formatDate` has no call site. Keeping it exported from the barrel/`datetime.ts`
  is fine for contract completeness and the unit test covers it, but note it is presently unused so a
  future reader doesn't hunt for a missing consumer. Documentation-only.

- **L2 — Pin the date-fns locale explicitly.** `formatInTimeZone(parseISO(iso), tz, fmt)` with no
  `locale` is correct (date-fns defaults to `enUS` and does **not** read the machine locale — the
  determinism win), but passing `{ locale: enUS }` (from `date-fns/locale`) self-documents the
  stability and future-proofs against a default change. Optional polish.

- **L3 — Global `afterEach(cleanup)` interaction.** The shared `vitest.setup.ts`
  (`@testing-library/jest-dom/vitest` + `afterEach(cleanup)`) is additive and safe: the existing
  `useTournamentQuery.test.tsx` manages its own `vi.restoreAllMocks()` and a global `cleanup` only
  unmounts rendered trees. The plan already flags the jest-dom `/vitest` import-path risk in Risks.
  Verify the node domain suite stays green after `setupFiles` lands (plan step 2 does this).

- **L4 — `prettier-plugin-tailwindcss` + Tailwind v4 with no `tailwind.config.js`.** v4 uses
  `@import 'tailwindcss'` + `@theme` in `global.css`. The plan notes the plugin auto-detects v4 and a
  no-op sort is acceptable; pin a plugin version known to support v4. Correctly captured in Risks.
  Also expect the first `prettier --write .` to produce a large tree-wide diff (plan step 8 reviews it;
  `.prettierignore` excludes snapshots/png/dist/coverage).

## Checklist Verdict

- **Completeness:** All requirement items addressed; acceptance criteria map 1:1 to the requirement's
  reviewable criteria. Migration-done rows explicitly excluded, not redone.
- **Feasibility:** Every path/line/grep claim verified accurate against the real tree. The surgical
  single-funnel approach (one date façade, one icon file, dep+smoke-test only for d3) is realistic.
- **Architecture:** Sound. New `src/lib/datetime.ts` is small, pure, no-React (<120 lines); `format.ts`
  degrades to a thin barrel; no scope creep (d3 construction pushed to req #2; framer-motion deferred
  per the anti-bloat instruction).
- **Reuse:** Correctly adopts canonical libs (date-fns-tz, d3-hierarchy, lucide-react) instead of
  hand-rolling, while keeping domain logic hand-written per non-goals.
- **Test strategy:** Clear RED/GREEN path; deterministic fixed-zone golden strings; two-zone divergence
  test proves date-fns-tz is wired (not Intl); component test uses user-event and asserts the a11y
  contract; ≥80% coverage stated for the one new logic module; existing suites enumerated as regression
  guards; null/empty edge cases covered.
- **Non-functionals:** Determinism (fixed UTC + pinned Playwright tz/locale), accessibility (decorative
  `aria-hidden` icon, preserved label, untouched `inert` panel), compositor-only animation kept, bundle
  discipline (date-fns tree-shakeable; framer-motion not added). No secrets, no console.log, explicit
  null-guard before `parseISO`.
- **Risks:** Real risks named with mitigations (snapshot churn, vitest env split, jest-dom import path,
  plugin/v4, framer-motion deferral trigger, d3 dep-without-consumer ordering).

All findings are MEDIUM or below. No CRITICAL or HIGH issues.

## Verdict

VERDICT: APPROVED
