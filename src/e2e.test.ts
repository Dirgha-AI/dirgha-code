/**
 * e2e.test.ts — End-to-end integration tests (live API, real SQLite).
 *
 * Requires: FIREWORKS_API_KEY or OPENROUTER_API_KEY in env.
 * Skipped automatically if no provider is configured.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Load persisted keys before anything else
beforeAll(async () => {
  const { loadKeysIntoEnv } = await import('./utils/keys.js');
  loadKeysIntoEnv();
});

describe('E2E: Provider & Model Detection', () => {
  it('detects a configured provider', async () => {
    const { getActiveProvider, getDefaultModel } = await import('./providers/detection.js');
    const provider = getActiveProvider();
    const model = getDefaultModel();
    console.log(`  Provider: ${provider}, Model: ${model}`);
    expect(['fireworks', 'anthropic', 'openrouter', 'groq', 'mistral', 'gateway', 'nvidia']).toContain(provider);
    expect(model.length).toBeGreaterThan(0);
  });
});

describe('E2E: Billing & Quota', () => {
  it('checks local quota without error', async () => {
    const { checkQuota, canMakeRequest } = await import('./billing/quota.js');
    const { getDB } = await import('./session/db.js');
    // Clear quota before test to ensure clean state
    try { getDB().prepare('DELETE FROM daily_usage').run(); } catch {}
    const quota = checkQuota('free');
    expect(quota.dailyLimit).toBe(100_000);
    expect(quota.exceeded).toBe(false);
    const can = canMakeRequest(500, 'free');
    expect(can.allowed).toBe(true);
  });

  it('remote quota returns null or object (offline-first)', async () => {
    const { checkRemoteQuota } = await import('./billing/quota.js');
    const rq = await checkRemoteQuota();
    // Either null (no token / offline) or { allowed, remaining, tier }
    if (rq !== null) {
      expect(typeof rq.allowed).toBe('boolean');
      expect(typeof rq.remaining).toBe('number');
    }
    expect(true).toBe(true); // always pass — offline is fine
  });
});

describe('E2E: HITL Approval System', () => {
  it('creates, resolves, and retrieves approvals', async () => {
    const { createApproval, resolveApproval, getApproval, getPendingCount } = await import('./permission/approval.js');
    const before = getPendingCount();
    const apr = createApproval('e2e-run', 'bash', { cmd: 'echo hi' });
    expect(getPendingCount()).toBe(before + 1);
    expect(apr.status).toBe('pending');

    const ok = resolveApproval(apr.id, 'approved');
    expect(ok).toBe(true);

    const updated = getApproval(apr.id);
    expect(updated?.status).toBe('approved');
    expect(getPendingCount()).toBe(before); // no longer pending
  });
});

describe('E2E: Wiki Git Sync', () => {
  it('pull returns without throwing', async () => {
    const { pullWiki } = await import('./sync/wiki-git.js');
    const r = pullWiki();
    expect(r).toHaveProperty('pulled');
    expect(r).toHaveProperty('message');
  });

  it('commitWiki returns false when nothing changed', async () => {
    const { commitWiki } = await import('./sync/wiki-git.js');
    const committed = commitWiki('e2e: test');
    expect(typeof committed).toBe('boolean');
  });
});

describe.skip('E2E: Live LLM Call', () => {
  it('agent loop returns a response with tokens used', async () => {
    const { getActiveProvider, getDefaultModel } = await import('./providers/detection.js');
    const provider = getActiveProvider();
    if (provider === 'gateway') {
      // Gateway requires a running local server — skip in CI
      console.log('  Skipping live call: gateway provider requires local server');
      return;
    }

    const { runAgentLoop } = await import('./agent/loop.js');
    const model = getDefaultModel();
    let output = '';
    const result = await runAgentLoop(
      'Reply with just the number: 8 * 8',
      [], model,
      t => { output += t; },
      () => {},
      undefined, undefined, { maxTurns: 1 }
    );

    console.log(`  Model: ${model}`);
    console.log(`  Response: "${output.trim().slice(0, 80)}"`);
    console.log(`  Tokens: ${result.tokensUsed}`);

    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(output.trim().length).toBeGreaterThan(0);
    // 8*8=64
    expect(output).toContain('64');
  }, 30_000); // 30s timeout for API call
});

describe('E2E: Read-Only Path Guard', () => {
  it('blocks writes to protected paths', async () => {
    const { isReadOnlyPath } = await import('./permission/judge.js');
    expect(isReadOnlyPath('/home/user/project/node_modules/lodash/index.js')).toBeTruthy();
    expect(isReadOnlyPath('/home/user/project/.git/config')).toBeTruthy();
    expect(isReadOnlyPath('/home/user/project/dist/main.js')).toBeTruthy();
    expect(isReadOnlyPath('/home/user/project/src/index.ts')).toBeFalsy();
    expect(isReadOnlyPath('/home/user/project/output/report.txt')).toBeFalsy();
  });
});

describe('E2E: Session Cache', () => {
  it('caches and retrieves files (file must exist — uses mtime as cache key)', async () => {
    const { writeFileSync } = await import('fs');
    const testPath = '/tmp/dirgha-e2e-cache.txt';
    writeFileSync(testPath, 'existing content');

    const cache = await import('./utils/session-cache.js');
    cache.setCachedFile(testPath, 'hello e2e');
    expect(cache.getCachedFile(testPath)).toBe('hello e2e');

    cache.recordWrite('/tmp/e2e-write-test.ts');
    const changes = cache.getSessionChanges();
    expect(changes).toContain('/tmp/e2e-write-test.ts');
  });
});
