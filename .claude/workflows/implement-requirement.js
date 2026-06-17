export const meta = {
  name: 'implement-requirement',
  description:
    'Run a requirement through the 7-stage gated TDD pipeline using the req-* agents (all opus, xhigh effort).',
  whenToUse:
    'Fully-automated, background execution of plan → review → test → refactor → implement → review → final review.',
  phases: [
    { title: 'Plan', detail: 'plan + gated plan review (loop up to 3x)', model: 'opus' },
    { title: 'Test', detail: 'write RED tests, then refactor them (still RED)', model: 'opus' },
    {
      title: 'Implement',
      detail: 'implement to GREEN + gated code review (loop up to 3x)',
      model: 'opus',
    },
    {
      title: 'Final',
      detail: 'holistic review: tradeoffs, debt, risks, follow-ups',
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

const ctx = `Run folder (absolute): ${runDir}\nRequirement file: ${runDir}/requirement.md\nRequirement:\n${requirement}`;
const MAX_ITERS = 3;

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

// ---- Final holistic review (always runs; reports honestly even if a gate failed) ----
phase('Final');
const finalReview = await agent(
  `${ctx}\n\nProduce the holistic final review of the whole effort (requirement satisfaction, tradeoffs, tech debt, risks, test posture, prioritized follow-ups). Implementation gate result: ${implApproved ? 'APPROVED' : 'NOT APPROVED after ' + implIters + ' iterations'}. Write ${runDir}/final-review.md and return an executive summary with an overall verdict.`,
  { ...TIER, agentType: 'req-final-reviewer', phase: 'Final', label: 'final-review' },
);

return {
  slug,
  runDir,
  planIters,
  implIters,
  planApproved,
  implApproved,
  testWrite,
  testRefactor,
  finalReview,
};
