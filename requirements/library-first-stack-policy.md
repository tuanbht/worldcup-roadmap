# Requirement: Library-first stack policy

> **⚠️ Framework row UPDATED by [direct-fifa-frontend.md](./direct-fifa-frontend.md):** the stack is now
> **Vite + React SPA with NO backend** (no Hono API). The SPA fetches FIFA directly; the TanStack Query /
> date-fns / Zod / etc. rows still apply.

> **For planners, implementers, and reviewers.** Standing policy for the whole `wc-roadmap` codebase.

## Policy

**Prefer the most popular, well-maintained, relevant library for every cross-cutting/infrastructure
concern instead of hand-rolling it.** Don't reinvent solved problems (dates, HTTP, caching, styling,
validation, testing). Pick the de-facto-standard library for each concern and use it consistently.

Resolved with the requester:

- **Scope = infrastructure only.** Library-first applies to cross-cutting concerns. **Bespoke domain
  logic stays hand-written** — no library models World Cup rules (standings, bracket topology, seeding,
  the deterministic simulator). See _Non-goals_.
- **Strictness = strong default, justify exceptions.** Reach for the canonical library first; custom code
  is allowed when a library is genuinely overkill, but the deviation must be justified in review.
- ~~**Bundler = Next.js 15 is kept.**~~ **SUPERSEDED by [migrate-to-vite-react.md](./migrate-to-vite-react.md):**
  the app migrates to a **Vite + React SPA + a thin Hono API**; Next.js is removed. (The original decision kept
  Next/Turbopack; the owner has since chosen plain React. TanStack Query stays — it now calls the Hono API.)

## Canonical stack map (single source of truth)

| Concern                           | Library (pick)                                                       | Status                    | Notes                                                                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework / routing / bundler     | **Vite + React SPA + Hono API** (was Next.js 15)                     | ✅ migrated               | Per `migrate-to-vite-react.md`; Vite builds the SPA (`src/main.tsx`), Hono serves `/api/worldcup`. Next.js removed — no `'use client'`, no route handlers.                                                                                                          |
| Language                          | **TypeScript 5**                                                     | ✅ in repo                | —                                                                                                                                                                                                                                                                   |
| Styling                           | **Tailwind CSS v4**                                                  | ✅ in repo                | Single styling system; oklch design tokens live in `src/styles/global.css` via Tailwind v4 `@theme`. `prettier-plugin-tailwindcss` added for class order.                                                                                                           |
| Accessible UI primitives          | **shadcn/ui** (Radix)                                                | ➕ add (optional)         | For dialogs/tabs/tooltip etc. Most popular, accessible-by-default.                                                                                                                                                                                                  |
| Server state / data fetching      | **TanStack Query** (`@tanstack/react-query`)                         | ✅ in repo                | Client-side fetch/caching + **live polling** via `useTournamentQuery.ts` over the Hono API (replaced the hand-rolled `fetch`+`setInterval`). Pairs with native `fetch`. Server state not copied into a client store.                                                |
| Client state (only if needed)     | **Zustand**                                                          | ➕ add if needed          | React Flow already uses it internally. Per project patterns.                                                                                                                                                                                                        |
| URL state (filters / active view) | **nuqs**                                                             | ➕ add if needed          | Type-safe URL search-param state. Not added — `useStageView` already does URL state by hand correctly.                                                                                                                                                              |
| Date/time + timezone              | **date-fns** + **date-fns-tz**                                       | ✅ in repo                | All kickoff rendering routes through `src/lib/datetime.ts` (`formatInTimeZone` + `parseISO`); `format.ts` re-exports it. No `Intl` date formatting remains. Single date lib (no Luxon/moment/dayjs).                                                                |
| Validation                        | **Zod**                                                              | ✅ in repo                | The standard; already the data boundary (`parseTournament`, `env.ts`). Keep.                                                                                                                                                                                        |
| Graph / zoomable canvas           | **React Flow** (`@xyflow/react`)                                     | ✅ in repo                | Smooth mouse-wheel zoom; owns graph motion. See `zoomable-roadmap-graph.md`.                                                                                                                                                                                        |
| Tree / bracket layout             | **d3-hierarchy**                                                     | ✅ in repo (dep)          | Added (+ `@types/d3-hierarchy`) with a smoke test; bracket→tree construction lands in req #2. A bracket is a binary tree → `d3.tree`/`d3.cluster`. **Supersedes Dagre** (never added; dagre/dagre-d3 deprecated). `elkjs` only if needed.                           |
| Icons                             | **lucide-react**                                                     | ✅ in repo                | Most popular React icon set. The `MatchDetailPanel` close `✕` glyph is now an accessible `<X aria-hidden />`; no inline icon glyphs/SVGs remain in `src/`.                                                                                                          |
| UI animation (non-graph)          | **Framer Motion** (`motion`)                                         | ⏸ deferred — no consumer | Not added (anti-bloat). The only non-graph motion is the `MatchDetailPanel` slide, already a compositor-only CSS `transition-transform`; React Flow owns graph motion. Revisit when a surface needs orchestrated enter/exit CSS can't express.                      |
| HTTP client                       | native **fetch**                                                     | ✅ native                 | No dep. Wrapped by TanStack Query. (`ky` only if a thin wrapper is truly wanted.)                                                                                                                                                                                   |
| Number / locale formatting        | native **Intl**                                                      | ✅ native                 | No dep needed.                                                                                                                                                                                                                                                      |
| Unit / component testing          | **Vitest** + **@testing-library/react** (+ `jest-dom`, `user-event`) | ✅ in repo                | Vitest + Testing Library (`react`/`jest-dom`/`user-event`/`jsdom`) wired via `vitest.setup.ts`; component tests use the per-file `// @vitest-environment jsdom` pragma.                                                                                             |
| E2E testing                       | **Playwright** (`@playwright/test`)                                  | ✅ in repo                | Critical flows (`e2e/roadmap`, `a11y`, `visual`). `use.timezoneId: 'UTC'` + `locale: 'en-US'` pin kickoff text deterministically.                                                                                                                                   |
| Lint / format                     | **Prettier** (+ tailwind plugin)                                     | ✅ in repo                | `prettier` + `prettier-plugin-tailwindcss` added; config + `format`/`format:check` scripts in `package.json`. No ESLint config (removed with Next).                                                                                                                 |
| Fonts                             | **@fontsource/archivo** + **@fontsource/inter**                      | ✅ in repo                | Was `next/font`; now self-hosted via `@fontsource` (`font-display: swap`).                                                                                                                                                                                          |
| Images / flags                    | plain `<img loading="lazy" width height>`                            | ✅ in repo                | Was `next/image`; the `next.config.ts` `remotePatterns` FIFA-host allow-list is dropped with Next. `Flag.tsx` loads flags directly with a monogram `onError` fallback. A future CSP must allow `https://api.fifa.com` + `https://digitalhub.fifa.com` in `img-src`. |

Legend: ✅ already in place · ⚠️ partially present · ➕ to add.

## Non-goals (stays hand-written — do NOT library-ize)

- Domain rules and derivations: `computeGroups` (standings), `buildBracket` (topology), `R32_SEEDING`,
  `stage-order`, and the deterministic mock simulator (`mulberry32` PRNG, Poisson `drawGoals`, `decide`).
  These encode WC-specific rules or are tiny deterministic helpers with no canonical library.
- **Allowed justified exception:** the inline `mulberry32` seeded PRNG stays (zero-dep, deterministic,
  well-understood) rather than adding `seedrandom` — determinism of fixtures matters more than the dep.

## Tensions to reconcile (call out, don't silently duplicate)

- **Tailwind vs design tokens:** keep the oklch token set, but define it in Tailwind v4 `@theme` — one
  styling system, not two. Don't keep a parallel bespoke CSS framework.
- **TanStack Query vs the Hono API (post-migration):** the **Hono** `/api/worldcup` endpoint does the
  server-side fetch + Zod validation; **TanStack Query** owns client-side fetch, **live polling**, and cache
  (`useTournamentQuery.ts`). Don't duplicate server state into a client store. (Next.js server components /
  route handlers no longer exist — superseded by the Vite + Hono migration.)
- **date lib vs `Intl`:** tz conversions are standardized on **date-fns + date-fns-tz** via the single
  `src/lib/datetime.ts` façade; all kickoff/timezone rendering goes through it. Native `Intl` may still be used
  for number/locale formatting, but **not** for date/timezone display.

## Acceptance criteria (reviewable)

- This stack map is the single source of truth; a PR adding a custom util for a listed concern must use
  the mapped library or justify the deviation in review.
- **No hand-rolled date/timezone formatting** — all `kickoff` rendering goes through the tz lib.
- **No bespoke fetch/caching layer** — client data fetching/polling uses TanStack Query.
- **Styling is Tailwind** (utilities + theme tokens); no second styling system beyond global resets/tokens.
- Unit/component tests use Vitest + Testing Library; critical flows have Playwright E2E.
- `package.json` reflects the map with **no two libraries solving the same concern** (e.g. not both
  `date-fns` and `luxon`, not both `axios` and `ky`).
- Domain logic remains pure, framework-agnostic TypeScript (unchanged by this policy).

## Review enforcement (per strictness = strong default)

- Hand-rolling a mapped concern without justification → **MEDIUM** (return for rework or written rationale).
- Introducing a **second** library for an already-covered concern (dependency bloat / inconsistency) → **HIGH**.
- Replacing domain logic with a library against _Non-goals_ → **reject** (out of scope).

## Follow-up: update the existing spec

`requirements/zoomable-roadmap-graph.md` predates this policy — update it to: Dagre → **d3-hierarchy**,
add **Tailwind** for styling, **TanStack Query** for any live data, and the **tz lib** for kickoff display.
