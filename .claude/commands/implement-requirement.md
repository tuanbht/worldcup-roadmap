---
description: Run a requirement through the 10-stage gated TDD pipeline (plan → review → test → refactor test → implement → review → live verify → final review → commit → archive/soft-delete).
argument-hint: <requirement description, or path to a requirement file>
---

You are the **orchestrator** of the requirement-implementation pipeline. Drive the ten `req-*` subagents in order, enforce the review gates, and loop back on rejection. Do the coordination yourself; delegate the actual work to the subagents via the Task tool.

**Only ever implement ACTIVE requirements** — `requirements/*.md` that do NOT end in `.deleted.md`. A `*.deleted.md` file is a finished requirement that the archiver (stage 10) soft-deleted; it is kept for audit ONLY. When scanning `requirements/` to pick work, skip every `*.deleted.md`.

## The requirement

`$ARGUMENTS`

If that is empty, ask the user for the requirement before proceeding. If it is a file path, read it.

## Setup

1. Derive a short kebab-case `<slug>` from the requirement.
2. Create the run folder `docs/pipeline/<slug>/` and write the requirement verbatim to `docs/pipeline/<slug>/requirement.md`.
3. Use this folder for every artifact below. Always pass each subagent the **absolute paths** it needs (it does not share your context).

## Pipeline (run in order)

**Stage 1 — Plan.** Dispatch `req-planner` with `requirement.md` and the run folder. It writes `plan.md`.

**Stage 2 — Review plan (GATE).** Dispatch `req-plan-reviewer` with `requirement.md` + `plan.md`. It writes `plan-review.md` and returns `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`.

- If `CHANGES_REQUESTED`: re-dispatch `req-planner` with `plan-review.md` to revise, then review again. Max **3** plan iterations; if still not approved, stop and surface the blockers to the user.

**Stage 3 — Write tests (RED).** Dispatch `req-test-writer` with the approved `plan.md`. It writes failing tests and confirms they fail for the right reason.

**Stage 4 — Refactor tests (still RED).** Dispatch `req-test-refactorer`. It improves the tests without weakening them or adding production code, and confirms they are still RED.

**Stage 5 — Implement (GREEN).** Dispatch `req-implementer` with `plan.md` + the tests. It writes production code until the suite is green, then runs typecheck/lint/build.

**Stage 6 — Review implementation (GATE).** Dispatch `req-impl-reviewer` with the changed code + `plan.md` + tests. It writes `impl-review.md` and returns a verdict.

- If `CHANGES_REQUESTED`: re-dispatch `req-implementer` with `impl-review.md`, then review again. Max **3** implementation iterations; if still not approved, stop and surface the blockers.

**Stage 7 — Live verify.** Only if the stage-6 gate was APPROVED. Dispatch `req-live-verifier`. It drives the REAL running app at `http://localhost:3217` with Playwright, demonstrates the requirement's UI-observable acceptance criteria against the live DOM, captures screenshots as evidence, and returns **PASS / FAIL / SKIPPED**. A **FAIL** blocks the commit (stage 9); **SKIPPED** (no UI surface, or the app/Playwright could not run) does not block but must be surfaced to the user.

**Stage 8 — Final holistic review.** Dispatch `req-final-reviewer` with the whole run (including the live-verify result). It writes `final-review.md` (tradeoffs, tech debt, risks, follow-ups, verdict).

**Stage 9 — Commit.** Only if the stage-6 gate was APPROVED and stage 7 did not FAIL. Dispatch `req-committer`. It verifies all gates are green, then makes ONE Conventional-Commits commit of just this requirement's files (no push). If a gate is red, it does not commit — surface that instead of advancing.

**Stage 10 — Archive (soft-delete).** Only after stage 9 commits. Dispatch `req-archiver`. It renames `requirements/<slug>.md` → `requirements/<slug>.deleted.md` (content preserved for audit) and commits the rename, so future scans skip this requirement.

## Rules

- The project's `requirements/` directory is the authoritative source of truth. Read it at the start and have every stage re-consult the relevant requirement file frequently while working — keep the build aligned to the requirement, not only to upstream stage artifacts.
- All ten `req-*` agents run on **opus**. Under ultracode the session's **xhigh ("ultra") effort** propagates to them; for guaranteed xhigh effort regardless of session, run the `.claude/workflows/implement-requirement.js` variant instead, which pins it per call.
- Enforce the gates. Do not advance past a `CHANGES_REQUESTED` gate until it is `APPROVED` or you hit the iteration cap.
- **Commit + archive only on success.** Stage 9 (commit) runs only when stage 6 was APPROVED and stage 7 (live verify) did not FAIL; the committer re-checks the gates and refuses to commit a red tree. Stage 10 (archive) runs only after the commit lands. The committer and archiver **never push** and never use `--no-verify` — pushing stays the user's call.
- Keep the user informed between stages with a one-line status (stage, verdict, key artifact path). Do not dump full subagent output unless asked.
- Never skip the test stages. Tests are written and must be RED before implementation begins.

## Final report to the user

A compact summary: per-stage outcome (and iteration counts), the final verdict from stage 7, the top tradeoffs/risks, recommended follow-ups, and links to the artifacts in `docs/pipeline/<slug>/`.
