export const meta = {
  name: 'implement-requirement',
  description:
    'Run a requirement through the gated TDD pipeline using the req-* agents (all opus, xhigh effort): claim (.md→.process.md) → plan → review → test → refactor → implement → review → live-verify → final → commit → archive (.process.md→.deleted.md).',
  whenToUse:
    'Fully-automated, background execution: claim the requirement (mark in-progress) → plan → review → test → refactor → implement → review → live verify (Playwright) → final review → commit → soft-delete (archive).',
  phases: [
    {
      title: 'Claim',
      detail: 'mark in-progress: rename <slug>.md → <slug>.process.md',
      model: 'sonnet',
    },
    { title: 'Plan', detail: 'plan + gated plan review (loop up to 3x)', model: 'opus' },
    { title: 'Test', detail: 'write RED tests, then refactor them (still RED)', model: 'opus' },
    {
      title: 'Implement',
      detail: 'implement to GREEN + gated code review (loop up to 3x)',
      model: 'opus',
    },
    {
      title: 'Live verify',
      detail:
        'demonstrate the acceptance criteria in the running app (Playwright): PASS/FAIL/SKIPPED',
      model: 'opus',
    },
    {
      title: 'Final',
      detail: 'holistic review: tradeoffs, debt, risks, follow-ups',
      model: 'opus',
    },
    {
      title: 'Commit',
      detail: 'verify gates green, then one Conventional-Commits commit (no push)',
      model: 'opus',
    },
    {
      title: 'Archive',
      detail: 'soft-delete the requirement: rename <slug>.process.md → <slug>.deleted.md',
      model: 'opus',
    },
  ],
};

// args: { requirement: string, slug: string, runDir: string (absolute) }
const requirement = args?.requirement;
const slug = args?.slug;
const runDir = args?.runDir;
if (!requirement || !slug || !runDir) {
  throw new Error('implement-requirement workflow requires args: { requirement, slug, runDir }');
}

// Every stage runs on opus at ultra (xhigh) reasoning effort.
const TIER = { model: 'opus', effort: 'xhigh' };

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED'] },
    summary: { type: 'string' },
    requiredChanges: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary', 'requiredChanges'],
};

const LIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'SKIPPED'] },
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary', 'evidence'],
};

const ctx = `Run folder (absolute): ${runDir}\nRequirement file: ${runDir}/requirement.md\nRequirement:\n${requirement}`;
const MAX_ITERS = 3;

// ---- Claim: mark the requirement in-progress so nothing else picks it up. ----
phase('Claim');
const claim = await agent(
  `${ctx}\n\nClaim this requirement before planning starts: rename requirements/${slug}.md → requirements/${slug}.process.md (git mv, content unchanged) and commit it (chore(requirements): claim ${slug} — in progress (.process.md), no push). If it is already ${slug}.process.md or ${slug}.deleted.md, do nothing and report. Return the in-progress path and the claim commit hash.`,
  { model: 'sonnet', effort: 'medium', agentType: 'req-claimer', phase: 'Claim', label: 'claim' },
);
log(`Claim: ${slug} marked in-progress (.process.md)`);

// ---- Plan + gated review ----
phase('Plan');
let planFeedback = '';
let planApproved = false;
let planIters = 0;
for (let i = 1; i <= MAX_ITERS && !planApproved; i++) {
  planIters = i;
  const revisionNote = planFeedback
    ? `\n\nThis is revision #${i}. Address every item in ${runDir}/plan-review.md, specifically:\n${planFeedback}`
    : '';
  await agent(`${ctx}\n\nWrite the implementation plan to ${runDir}/plan.md.${revisionNote}`, {
    ...TIER,
    agentType: 'req-planner',
    phase: 'Plan',
    label: `plan#${i}`,
  });

  const review = await agent(
    `${ctx}\n\nReview ${runDir}/plan.md against the requirement. Write ${runDir}/plan-review.md. Return your verdict.`,
    {
      ...TIER,
      agentType: 'req-plan-reviewer',
      phase: 'Plan',
      label: `plan-review#${i}`,
      schema: REVIEW_SCHEMA,
    },
  );

  if (review?.verdict === 'APPROVED') planApproved = true;
  else planFeedback = (review?.requiredChanges || []).map((c, n) => `${n + 1}. ${c}`).join('\n');
}
log(`Plan stage: ${planApproved ? 'APPROVED' : 'NOT APPROVED'} after ${planIters} iteration(s)`);
if (!planApproved)
  return {
    stoppedAt: 'plan',
    planIters,
    reason: 'plan not approved within iteration cap',
    planFeedback,
  };

// ---- Tests: write (RED) then refactor (still RED) ----
phase('Test');
const testWrite = await agent(
  `${ctx}\n\nThe plan at ${runDir}/plan.md is approved. Write failing (RED) tests from its acceptance criteria. Confirm they fail for the right reason.`,
  { ...TIER, agentType: 'req-test-writer', phase: 'Test', label: 'write-tests' },
);
const testRefactor = await agent(
  `${ctx}\n\nRefactor the RED tests for quality (DRY, naming, determinism, stronger assertions, missing edge cases). Do not weaken them or add production code. Confirm still RED.`,
  { ...TIER, agentType: 'req-test-refactorer', phase: 'Test', label: 'refactor-tests' },
);

// ---- Implement to GREEN + gated code review ----
phase('Implement');
let implFeedback = '';
let implApproved = false;
let implIters = 0;
for (let i = 1; i <= MAX_ITERS && !implApproved; i++) {
  implIters = i;
  const revisionNote = implFeedback
    ? `\n\nThis is revision #${i}. Fix every Required Change in ${runDir}/impl-review.md, specifically:\n${implFeedback}`
    : '';
  await agent(
    `${ctx}\n\nImplement production code so the test suite passes (GREEN), following ${runDir}/plan.md. Then run test/typecheck/lint/build.${revisionNote}`,
    { ...TIER, agentType: 'req-implementer', phase: 'Implement', label: `implement#${i}` },
  );

  const review = await agent(
    `${ctx}\n\nReview the implementation against ${runDir}/plan.md and the tests. Run the gates yourself. Write ${runDir}/impl-review.md. Return your verdict.`,
    {
      ...TIER,
      agentType: 'req-impl-reviewer',
      phase: 'Implement',
      label: `impl-review#${i}`,
      schema: REVIEW_SCHEMA,
    },
  );

  if (review?.verdict === 'APPROVED') implApproved = true;
  else implFeedback = (review?.requiredChanges || []).map((c, n) => `${n + 1}. ${c}`).join('\n');
}
log(
  `Implementation stage: ${implApproved ? 'APPROVED' : 'NOT APPROVED'} after ${implIters} iteration(s)`,
);

// ---- Live verification: demonstrate the requirement in the running app
// (Playwright). Only runs on an approved implementation; PASS/FAIL/SKIPPED. ----
let liveVerify = null;
if (implApproved) {
  phase('Live verify');
  liveVerify = await agent(
    `${ctx}\n\nThe implementation is APPROVED and unit-green. Demonstrate the requirement's UI-observable acceptance criteria in the REAL running app at http://localhost:3217 with Playwright (start the dev server only if it is not already up; stop it after if you started it). Capture screenshots into ${runDir}/evidence/ and assert against the LIVE DOM. Return PASS (all UI criteria demonstrated), FAIL (a criterion is broken in the running app — blocks commit), or SKIPPED (could not run / no UI surface), with evidence paths.`,
    {
      ...TIER,
      agentType: 'req-live-verifier',
      phase: 'Live verify',
      label: 'live-verify',
      schema: LIVE_SCHEMA,
    },
  );
  log(`Live verify: ${liveVerify?.verdict ?? 'UNKNOWN'} — ${liveVerify?.summary ?? ''}`);
}

// ---- Final holistic review (always runs; reports honestly even if a gate failed) ----
phase('Final');
const finalReview = await agent(
  `${ctx}\n\nProduce the holistic final review of the whole effort (requirement satisfaction, tradeoffs, tech debt, risks, test posture, prioritized follow-ups). Implementation gate result: ${implApproved ? 'APPROVED' : 'NOT APPROVED after ' + implIters + ' iterations'}. Live verification: ${liveVerify ? liveVerify.verdict + ' — ' + liveVerify.summary : 'not run'}. Factor the live result into your verdict. Write ${runDir}/final-review.md and return an executive summary with an overall verdict.`,
  { ...TIER, agentType: 'req-final-reviewer', phase: 'Final', label: 'final-review' },
);

// ---- Commit + Archive: only when the implementation passed its gate AND live
// verification did not FAIL. We never commit a red tree, a feature broken in the
// running app, or archive an unimplemented requirement. (SKIPPED does not block.) ----
let commit = null;
let archive = null;
const liveBlocks = liveVerify?.verdict === 'FAIL';
if (implApproved && !liveBlocks) {
  phase('Commit');
  commit = await agent(
    `${ctx}\n\nThe implementation is APPROVED. Verify ALL gates green first (npm run typecheck, npm run test, npm run build, npx prettier --check .) — if any is red, do NOT commit, report what failed. Then stage ONLY this requirement's files (the plan's touched files + tests + any doc reconciliation; exclude .req-runs/, docs/pipeline/**, local .claude/agents/wc-*.md, the requirement marker requirements/*.process.md and any *.deleted.md, and unrelated concurrent edits) and create ONE Conventional-Commits commit (no push, no --no-verify). Return the commit hash, subject, files committed, and anything left unstaged.`,
    { ...TIER, agentType: 'req-committer', phase: 'Commit', label: 'commit' },
  );

  phase('Archive');
  archive = await agent(
    `${ctx}\n\nThe implementation is committed. Soft-delete this requirement so future scans skip it: rename requirements/${slug}.process.md → requirements/${slug}.deleted.md (the claimer renamed it to .process.md at stage 0; git mv, content preserved for audit) and commit that rename (chore(requirements): archive ${slug} — soft-delete (audit-only), no push). If only requirements/${slug}.md exists, archive that instead; if neither exists or it is already .deleted.md, report and stop cleanly. Return the archived path and the rename commit hash.`,
    { ...TIER, agentType: 'req-archiver', phase: 'Archive', label: 'archive' },
  );
} else {
  log(
    liveBlocks
      ? 'Skipping Commit + Archive: live verification FAILED in the running app (nothing is committed or archived).'
      : 'Skipping Commit + Archive: implementation gate not approved (nothing is committed or archived).',
  );
}

return {
  slug,
  runDir,
  claim,
  planIters,
  implIters,
  planApproved,
  implApproved,
  testWrite,
  testRefactor,
  liveVerify,
  finalReview,
  commit,
  archive,
};
