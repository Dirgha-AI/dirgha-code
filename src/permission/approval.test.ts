/**
 * permission/approval.test.ts — HITL approval system tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApproval, resolveApproval, listApprovals, getApproval, getPendingCount } from './approval.js';

// Use in-memory SQLite via the shared getDB
// Each test isolation achieved by unique run_ids

let runCounter = 0;
function nextRun() { return `test-run-${Date.now()}-${++runCounter}`; }

describe('createApproval', () => {
  it('creates a pending approval record', () => {
    const r = createApproval(nextRun(), 'bash', { command: 'ls' });
    expect(r.status).toBe('pending');
    expect(r.toolName).toBe('bash');
    expect(r.approvalType).toBe('required');
    expect(r.id).toMatch(/^apr_/);
  });

  it('supports audit approval type', () => {
    const r = createApproval(nextRun(), 'read_file', { path: '/etc/hosts' }, 'audit');
    expect(r.approvalType).toBe('audit');
  });
});

describe('resolveApproval', () => {
  it('approves a pending approval', () => {
    const r = createApproval(nextRun(), 'write_file', { path: '/tmp/x' });
    const ok = resolveApproval(r.id, 'approved');
    expect(ok).toBe(true);
    const updated = getApproval(r.id);
    expect(updated?.status).toBe('approved');
  });

  it('rejects a pending approval', () => {
    const r = createApproval(nextRun(), 'bash', { command: 'rm -rf /' });
    const ok = resolveApproval(r.id, 'rejected');
    expect(ok).toBe(true);
    const updated = getApproval(r.id);
    expect(updated?.status).toBe('rejected');
  });

  it('returns false when resolving already-resolved approval', () => {
    const r = createApproval(nextRun(), 'bash', { command: 'echo' });
    resolveApproval(r.id, 'approved');
    const ok = resolveApproval(r.id, 'rejected'); // already approved
    expect(ok).toBe(false);
  });
});

describe('listApprovals', () => {
  it('returns at least the approvals we created', () => {
    const runId = nextRun();
    createApproval(runId, 'tool_a', {});
    createApproval(runId, 'tool_b', {});
    const list = listApprovals('pending');
    const ours = list.filter(a => a.runId === runId);
    expect(ours.length).toBeGreaterThanOrEqual(2);
  });

  it('returns all statuses when no filter', () => {
    const list = listApprovals();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe('getApproval', () => {
  it('finds by full id', () => {
    const r = createApproval(nextRun(), 'shell', {});
    const found = getApproval(r.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(r.id);
  });

  it('finds by prefix', () => {
    const r = createApproval(nextRun(), 'shell', {});
    const prefix = r.id.slice(0, 8);
    const found = getApproval(prefix);
    expect(found).not.toBeNull();
  });

  it('returns null for unknown id', () => {
    expect(getApproval('nonexistent-xyz-000')).toBeNull();
  });
});

describe('getPendingCount', () => {
  it('returns a non-negative integer', () => {
    const count = getPendingCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('increments when new pending approval is created', () => {
    const before = getPendingCount();
    createApproval(nextRun(), 'counted', {});
    const after = getPendingCount();
    expect(after).toBe(before + 1);
  });
});
