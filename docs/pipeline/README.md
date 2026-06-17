# Requirement Implementation Pipeline

A reusable team of seven agents that takes a single requirement through a gated, test-driven implementation flow. Each agent has one job; reviews are **gates** that can send work back.

```
requirement
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
7. req-final-reviewer (tradeoffs, tech debt, risks, follow-ups)
```

## The agents

| #   | Agent                 | Role                                               | Model | Gate |
| --- | --------------------- | -------------------------------------------------- | ----- | ---- |
| 1   | `req-planner`         | Requirement → concrete, file-level plan            | opus  | —    |
| 2   | `req-plan-reviewer`   | Critique the plan; block on CRITICAL/HIGH          | opus  | ✅   |
| 3   | `req-test-writer`     | Write failing tests (RED) from acceptance criteria | opus  | —    |
| 4   | `req-test-refactorer` | Raise test quality; keep them RED                  | opus  | —    |
| 5   | `req-implementer`     | Implement to GREEN; run test/typecheck/lint/build  | opus  | —    |
| 6   | `req-impl-reviewer`   | Code review; block on CRITICAL/HIGH                | opus  | ✅   |
| 7   | `req-final-reviewer`  | Holistic, strategic close-out review               | opus  | —    |

The agents live in `.claude/agents/req-*.md`. They are deliberately small, single-purpose, and least-privilege (only the reviewers that must verify get `Bash`; review-only agents get no `Edit`).

**Model & effort:** every stage runs on **opus**. The workflow variant additionally pins **xhigh ("ultra") reasoning effort** on each agent call; the interactive command inherits the current session's effort (xhigh under ultracode). To dial this back later, edit each agent's `model:` frontmatter and the `TIER` constant in the workflow.

## How to run it

**Interactive (recommended for the first runs):**

```
/implement-requirement <your requirement, or a path to a requirement file>
```

The orchestrator (defined in `.claude/commands/implement-requirement.md`) drives the seven agents in order, enforces the two gates, loops back on rejection (max 3 iterations per gate), and gives you a one-line status between stages.

**Fully automated (background):** run the workflow in `.claude/workflows/implement-requirement.js`. It expects:

```js
args = {
  requirement: '<text>',
  slug: '<kebab-slug>',
  runDir: '<abs path to docs/pipeline/<slug>>',
};
```

It returns a structured summary (iteration counts, gate outcomes, final review).

## Artifacts

Every run gets a folder `docs/pipeline/<slug>/`:

```
requirement.md     plan.md         plan-review.md
impl-review.md     final-review.md
```

plus the tests and production code written into the repo proper.

## The review contract

Both gate agents end their response with exactly one machine-read line — `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED` — and, when changes are requested, a numbered `## Required Changes` list. The orchestrator/workflow keys off this to advance or loop.

## Customizing

- Change models per stage by editing the `model:` frontmatter in each agent.
- Tighten or relax a gate by editing its agent's "approve only if…" rule.
- Change the iteration cap in the command/workflow (`MAX_ITERS`).
- Promote the team to all projects by copying `.claude/agents/req-*.md` to `~/.claude/agents/`.

## First suggested use

The natural first requirement for this repo: the **zoomable, tree-like roadmap graph** built on `@xyflow/react`. Run `/implement-requirement "<describe the zoomable graph>"` to take it from nothing to a reviewed, tested implementation.
