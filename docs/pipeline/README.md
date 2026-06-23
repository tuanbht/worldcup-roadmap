# Requirement Implementation Pipeline

A reusable team of **eleven** agents that takes a single requirement from "to-do" all the way to "committed and archived" through a gated, test-driven flow. Each agent has one job; the reviews are **gates** that can send work back.

```
requirements/<slug>.md  (TODO)
   │
   ▼
0. req-claimer ──►  rename to requirements/<slug>.process.md  (claimed / in-progress)
   │
   ▼
1. req-planner ──► 2. req-plan-reviewer ──(CHANGES_REQUESTED)──┐
   ▲                      │ APPROVED                            │ loop ≤3
   └──────────────────────┴─────────────────────────────────────┘
                          │
                          ▼
3. req-test-writer (RED) ──► 4. req-test-refactorer (still RED)
                          │
                          ▼
5. req-implementer (GREEN) ──► 6. req-impl-reviewer ──(CHANGES_REQUESTED)──┐
   ▲                                  │ APPROVED                            │ loop ≤3
   └──────────────────────────────────┴──────────────────────────────────────┘
                          │
                          ▼
7. req-live-verifier (Playwright in the running app: PASS / FAIL / SKIPPED — FAIL blocks commit)
                          │
                          ▼
8. req-final-reviewer (tradeoffs, tech debt, risks, follow-ups)
                          │
                          ▼
9. req-committer ──►  one Conventional-Commits commit (gates green, no push)
                          │
                          ▼
10. req-archiver ──►  rename requirements/<slug>.process.md → <slug>.deleted.md  (DONE)
```

## Requirement lifecycle (3 states)

| State | File | Meaning | Scans |
| --- | --- | --- | --- |
| TODO | `requirements/<slug>.md` | active, not yet started — pickable | picked (oldest-first) |
| DOING | `requirements/<slug>.process.md` | claimed; a run is working it | **skipped** when picking new work; **resumed** on restart |
| DONE | `requirements/<slug>.deleted.md` | finished; soft-deleted, audit-only | **skipped** |

Only ever pick up an active `*.md` (not `*.process.md` / `*.deleted.md`). The claimer marks a requirement in-progress the moment a run takes it, so concurrent scans / sessions / the user never re-pick or collide on it.

## The agents

| #   | Agent                 | Role                                                          | Model  | Gate |
| --- | --------------------- | ------------------------------------------------------------ | ------ | ---- |
| 0   | `req-claimer`         | Mark in-progress: `<slug>.md` → `<slug>.process.md` + commit | sonnet | —    |
| 1   | `req-planner`         | Requirement → concrete, file-level plan                      | opus   | —    |
| 2   | `req-plan-reviewer`   | Critique the plan; block on CRITICAL/HIGH                    | opus   | ✅   |
| 3   | `req-test-writer`     | Write failing tests (RED) from acceptance criteria           | opus   | —    |
| 4   | `req-test-refactorer` | Raise test quality; keep them RED                            | opus   | —    |
| 5   | `req-implementer`     | Implement to GREEN; run test/typecheck/lint/build            | opus   | —    |
| 6   | `req-impl-reviewer`   | Code review; block on CRITICAL/HIGH                          | opus   | ✅   |
| 7   | `req-live-verifier`   | Demonstrate the feature in the REAL app (Playwright)         | opus   | ✅\* |
| 8   | `req-final-reviewer`  | Holistic, strategic close-out review                         | opus   | —    |
| 9   | `req-committer`       | One Conventional-Commits commit of the requirement's files   | opus   | —    |
| 10  | `req-archiver`        | Soft-delete: `<slug>.process.md` → `<slug>.deleted.md`       | opus   | —    |

\* The live verifier returns **PASS / FAIL / SKIPPED**. A **FAIL** blocks the commit (the feature is broken in the running app). **SKIPPED** (no UI surface, or the app/Playwright couldn't run) does not block, but must be surfaced.

The agents live in `.claude/agents/req-*.md`. They are deliberately small, single-purpose, and least-privilege (review-only agents get no `Edit`; only the agents that must touch git get `Bash`).

**Commit + archive run only on success** — when the stage-6 gate was APPROVED and stage-7 live verify did not FAIL. The committer re-checks all gates and refuses to commit a red tree. The committer and archiver **never push** (pushing stays the user's call) and never use `--no-verify`.

**Model & effort:** stages 1–10 run on **opus** (the claimer on **sonnet** — it's a mechanical rename). The workflow variant pins **xhigh ("ultra") reasoning effort** per call; the interactive command inherits the session's effort. To dial this back, edit each agent's `model:` frontmatter and the `TIER` constant in the workflow.

## How to run it

**Interactive (recommended for the first runs):**

```
/implement-requirement <your requirement, or a path to a requirement file>
```

The orchestrator (`.claude/commands/implement-requirement.md`) drives the eleven agents in order, enforces the gates, loops back on rejection (max 3 iterations per gate), and gives a one-line status between stages. When the argument is a `requirements/<slug>.md` path, the slug is its filename without `.md`.

**Fully automated (background):** run the workflow in `.claude/workflows/implement-requirement.js`. It expects:

```js
args = {
  requirement: '<text>',
  slug: '<kebab-slug>',
  runDir: '<abs path to docs/pipeline/<slug>>',
};
```

> Note: in some runtimes the `args` global is not injected into a file-based workflow invocation. When that happens, run an inline copy of the script with `requirement` / `slug` / `runDir` baked in as constants — the executable logic is identical.

It returns a structured summary (claim, iteration counts, gate outcomes, live-verify verdict, final review, commit, archive).

## Artifacts

Every run gets a folder `docs/pipeline/<slug>/`:

```
requirement.md   plan.md        plan-review.md
impl-review.md   final-review.md   evidence/   (live-verify screenshots)
```

plus the tests and production code written into the repo proper, the implementation commit, and the claim/archive rename commits.

## The review contract

Both gate agents return a structured verdict (`APPROVED` / `CHANGES_REQUESTED`) with a list of required changes; the live verifier returns `PASS` / `FAIL` / `SKIPPED` with evidence paths. The orchestrator/workflow keys off these to advance, loop, or block the commit.

## Resuming after a context compaction

A full run is long and **will** get compacted. This is a **checkpoint, not a stop** — all durable state is on disk, so the build team auto-restarts without losing progress:

- A `requirements/<slug>.process.md` is the **in-flight** requirement — continue it (do NOT re-claim), inferring the next stage from which artifacts exist in `docs/pipeline/<slug>/`.
- Only once no `.process.md` remains do you pick the next TODO (`*.md`, not `*.process.md`/`*.deleted.md`) — **oldest-first** by its `<YYYY-MM-DD-HHMM>-` prefix — and start it at stage 0 (claim).
- Continue until every active requirement is committed (stage 9) and archived to `*.deleted.md` (stage 10).

The orchestrator (`.claude/commands/implement-requirement.md`, _Resuming after a context compaction_) owns this protocol; the `wc-*` specialists likewise re-read the governing `requirements/*.md` + run artifacts on resume rather than trusting stale context.

## Customizing

- Change models per stage by editing the `model:` frontmatter in each agent.
- Tighten or relax a gate by editing its agent's "approve only if…" rule.
- Change the iteration cap in the command/workflow (`MAX_ITERS`).
- Promote the team to all projects by copying `.claude/agents/req-*.md` to `~/.claude/agents/`.
