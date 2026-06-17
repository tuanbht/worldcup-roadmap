# WC Roadmap — FIFA World Cup 2026

An interactive, zoomable, draggable **roadmap tree** for the FIFA World Cup 2026.
Group tables feed a live knockout bracket; every match node shows the two teams,
the kickoff time, and the score. Built with Next.js 15, React Flow, and Tailwind CSS.

![Views: Groups · Bracket · Full roadmap](https://img.shields.io/badge/views-groups·bracket·full-3ddc97)

## Highlights

- **Zoom / pan / drag** canvas powered by `@xyflow/react` (React Flow v12).
- **Mirrored bracket tree** — Round of 32 → Final, computed with a pure layout engine
  (no auto-layout dependency), plus the third-place play-off.
- **Three views** via a stage toggle (synced to the `?view=` URL): Groups, Bracket, Full roadmap.
- **Live data from the official FIFA API** (`api.fifa.com/api/v3`) behind a provider-agnostic
  adapter, with a deterministic **offline mock** so it runs with zero configuration.
- Match **detail panel** (desktop drawer / mobile bottom sheet), minimap, controls, keyboard
  shortcuts, and a "Midnight Pitch" dark theme.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 — runs against the offline mock by default
```

With no `.env`, the app serves a fully-simulated tournament (real teams, a live final),
so there's nothing to configure. To use live FIFA data, see **Data providers** below.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (domain, layout, mapper) |
| `npm run test:coverage` | Unit tests with coverage |
| `npm run test:e2e` | Playwright E2E (run `npx playwright install` once first) |

## Data providers

Configured via `WC_PROVIDER` (see `.env.example`):

| Value | Behaviour |
| --- | --- |
| `auto` (default) | FIFA API, transparently falling back to the mock on any failure |
| `fifa` | Strictly the official FIFA API (`idCompetition=17`, `idSeason=285023`) |
| `mock` | The bundled offline fixture — deterministic, no network |

FIFA's knockout fixtures are created only as teams qualify, so the bracket topology
(parent/child edges, placeholders) is **computed locally** and filled in as results arrive —
the app never depends on the API providing those links.

> Note: the original idea of scraping Google's sports widget isn't viable — that page is
> bot-protected and returns no structured data. The official FIFA API is the real source
> behind fifa.com's fixtures page and is used instead.

## Architecture

```
api.fifa.com / mock fixture
        │  (provider adapters: FifaRepository | MockRepository)
        ▼  normalize + zod-validate → Tournament
  MatchRepository ──▶ tournament-cache (TTL · single-flight · stale-on-error)
        ▼
  GET /api/worldcup  →  { success, data: Tournament, error }
        ▼  client polls; route TTL absorbs it
  build-graph  →  React Flow nodes/edges (per view)
        ▼
  RoadmapCanvas (@xyflow/react)  ·  MatchNode + AdvanceEdge + group tables
```

| Layer | Location |
| --- | --- |
| Domain types + bracket/standings logic | `src/domain/` |
| Providers, repository, cache, route | `src/data/`, `src/app/api/worldcup/` |
| Layout engine + graph builder + hooks | `src/features/roadmap/` |
| React Flow components | `src/components/` |

## Tech

Next.js 15 (App Router) · TypeScript · React Flow v12 (`@xyflow/react`) · Tailwind CSS v4 ·
zod · Vitest · Playwright.

## Keyboard

`F` fit view · `0` reset zoom · `Esc` close the detail panel · `Tab` focus match cards.
