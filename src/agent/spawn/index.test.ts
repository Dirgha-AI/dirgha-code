/**
 * agent/spawn/index.test.ts — Agent spawn tests (mngr-inspired)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as spawn from './index.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  spawn: vi.fn().mockReturnValue({ pid: 1234 }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  rmSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

describe('agent/spawn', () => {
  describe('types', () => {
    it('exports Agent type', () => {
      const agent: spawn.Agent = {
        id: 'test-id',
        name: 'test-agent',
        host: 'local',
        tmuxSession: 'agent-test-agent',
        workDir: '/tmp/test',
        status: 'running',
        provider: 'anthropic',
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      expect(agent.name).toBe('test-agent');
    });
  });

  describe('utils', () => {
    it('exports MNGR_DIR', () => {
      expect(spawn.MNGR_DIR).toContain('.dirgha');
    });
  });
});
