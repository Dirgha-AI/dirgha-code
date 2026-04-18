/**
 * project-session/__tests__/context.test.ts — Unit tests for ContextManager
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => '/root/dirgha-ai/domains/10-computer/cli/.test-context-sandbox',
  };
});

const SANDBOX_ROOT = '/root/dirgha-ai/domains/10-computer/cli/.test-context-sandbox';

import { ContextManager } from '../context.js';

describe('ContextManager', () => {
  let cm: ContextManager;
  
  beforeEach(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    cm = new ContextManager();
  });

  afterEach(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('switch()', () => {
    it('should set project and session boundaries', () => {
      const ctx = cm.switch('project-123', 'main');
      
      expect(ctx.projectId).toBe('project-123');
      expect(ctx.sessionId).toBe('main');
      expect(ctx.boundaries).toHaveLength(1);
      expect(ctx.boundaries[0].type).toBe('project');
    });

    it('should persist to disk', () => {
      cm.switch('project-123', 'main');
      
      // Reload from disk
      const cm2 = new ContextManager();
      const current = cm2.getCurrent();
      
      expect(current?.projectId).toBe('project-123');
    });
  });

  describe('stash()', () => {
    it('should create stash with current context', () => {
      cm.switch('project-123', 'main');
      
      const stash = cm.stash('before-refactor');
      
      expect(stash).toBeDefined();
      expect(stash?.name).toBe('before-refactor');
      expect(stash?.context.projectId).toBe('project-123');
    });

    it('should generate unique stash ID', () => {
      cm.switch('project-123', 'main');
      
      const s1 = cm.stash('stash-1');
      const s2 = cm.stash('stash-2');
      
      expect(s1?.id).not.toBe(s2?.id);
    });

    it('should return null when no active context', () => {
      const stash = cm.stash('test');
      expect(stash).toBeNull();
    });
  });

  describe('checkBoundary()', () => {
    beforeEach(() => {
      cm.switch('project-123', 'main');
    });

    it('should allow access within project boundary', () => {
      const check = cm.checkBoundary('read', 'project-123:main');
      expect(check.allowed).toBe(true);
    });

    it('should deny cross-project read without link', () => {
      const check = cm.checkBoundary('read', 'project-999:main');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Cross-project access denied');
    });

    it('should deny write to linked project', () => {
      cm.linkProject('project-123', 'project-999', 'other');
      const check = cm.checkBoundary('write', 'project-999:main');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Write access denied');
    });

    it('should suggest link command in error message', () => {
      const check = cm.checkBoundary('read', 'other-project:main');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBeDefined();
      if (check.reason) {
        expect(check.reason).toContain("dirgha context link");
      }
    });
  });

  describe('getCurrent()', () => {
    it('should return null initially', () => {
      expect(cm.getCurrent()).toBeNull();
    });
  });

  describe('listStashes()', () => {
    it('should return empty array initially', () => {
      expect(cm.listStashes()).toEqual([]);
    });

    it('should list all stashes', () => {
      cm.switch('project-123', 'main');
      cm.stash('stash-1');
      cm.stash('stash-2');
      const list = cm.listStashes();
      expect(list).toHaveLength(2);
    });
  });
});
