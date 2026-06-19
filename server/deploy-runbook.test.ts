// Node environment (the global vitest default).
//
// CR-7 #6: a deploy note must document the same-origin reverse-proxy assumption
// AND the CORS_ALLOWED_ORIGIN opt-in for split static-host + separate-API deploys.
// This asserts the runbook exists and names both constraints, so the documentation
// half of the acceptance criterion is enforced, not just the code half.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK_PATH = path.join(repoRoot, 'docs', 'deploy-runbook.md');

async function readRunbook(): Promise<string> {
  return readFile(RUNBOOK_PATH, 'utf8');
}

describe('CR-7 #6 deploy runbook note', () => {
  it('exists at docs/deploy-runbook.md', async () => {
    await expect(readRunbook()).resolves.toBeTypeOf('string');
  });

  it('documents the CORS_ALLOWED_ORIGIN opt-in env var', async () => {
    const contents = await readRunbook();
    expect(contents).toContain('CORS_ALLOWED_ORIGIN');
  });

  it('documents the same-origin reverse-proxy assumption', async () => {
    const contents = await readRunbook();
    const normalized = contents.toLowerCase();
    expect(normalized).toContain('same-origin');
    expect(normalized).toMatch(/proxy|reverse[- ]proxy/);
  });
});
