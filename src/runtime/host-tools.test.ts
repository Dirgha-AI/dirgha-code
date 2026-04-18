/**
 * rivet/host-tools.test.ts — Tests for host tool system
 */
import { describe, it, expect } from 'vitest';
import { hostToolRegistry, filesystemTool, shellTool } from './host-tools.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('hostToolRegistry', () => {
  it('lists registered tools', () => {
    const tools = hostToolRegistry.list();
    expect(tools.some(t => t.name === 'host_fs')).toBe(true);
    expect(tools.some(t => t.name === 'host_shell')).toBe(true);
  });

  it('executes filesystem read with permissions', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rivet-test-'));
    const testFile = join(tmpDir, 'test.txt');
    writeFileSync(testFile, 'hello world');

    const result = await hostToolRegistry.execute(
      'host_fs',
      { operation: 'read', path: testFile },
      { fsPermission: 'read', networkPermission: 'none', processPermission: 'none', limits: { maxMemoryMB: 100, maxCpuMs: 5000, timeoutMs: 30000 }, auditLog: [] }
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');

    rmSync(tmpDir, { recursive: true });
  });

  it('denies operations without permissions', async () => {
    const result = await hostToolRegistry.execute(
      'host_fs',
      { operation: 'read', path: '/etc/passwd' },
      { fsPermission: 'none', networkPermission: 'none', processPermission: 'none', limits: { maxMemoryMB: 100, maxCpuMs: 5000, timeoutMs: 30000 }, auditLog: [] }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Filesystem permission denied');
  });

  it.skip('enforces resource limits', async () => {
    const result = await hostToolRegistry.execute(
      'host_shell',
      { command: 'sleep 10' },
      { fsPermission: 'read', networkPermission: 'none', processPermission: 'execute', limits: { maxMemoryMB: 100, maxCpuMs: 5000, timeoutMs: 100 }, auditLog: [] }
    );

    expect(result.success).toBe(false);
    // spawnSync timeout returns ETIMEDOUT error
    expect(result.error || '').toMatch(/ETIMEDOUT|timed out|timeout/i);
  });

  it('returns unknown tool error', async () => {
    const result = await hostToolRegistry.execute(
      'unknown_tool',
      {},
      { fsPermission: 'read', networkPermission: 'none', processPermission: 'none', limits: { maxMemoryMB: 100, maxCpuMs: 5000, timeoutMs: 30000 }, auditLog: [] }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });
});
