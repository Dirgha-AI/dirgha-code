// @ts-nocheck

/**
 * project-session/__tests__/integration.test.ts — End-to-end integration tests
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => '/root/dirgha-ai/domains/10-computer/cli/.test-integration-sandbox',
  };
});

const SANDBOX_ROOT = '/root/dirgha-ai/domains/10-computer/cli/.test-integration-sandbox';

import { ProjectManager } from '../project.js';
import { SessionManager } from '../session.js';
import { ContextManager } from '../context.js';

describe('PTS Integration', () => {
  beforeEach(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('Full workflow: Project → Session → Context', () => {
    it('should handle complete project lifecycle', () => {
      const pm = new ProjectManager();
      const sm = new SessionManager();
      const cm = new ContextManager();

      // 1. Initialize project
      const project = pm.init('/tmp/dirgha-platform', 'dirgha-platform');
      expect(project.name).toBe('dirgha-platform');

      // 2. Create main session
      const main = sm.create(project.id, 'main');
      expect(main.name).toBe('main');
      expect(main.status).toBe('active');

      // 3. Fork feature session
      const feature = sm.fork(project.id, main.id, 'feature-payments');
      expect(feature?.parentId).toBe(main.id);

      // 4. Switch to feature context
      const ctx = cm.switch(project.id, 'feature-payments');
      expect(ctx.projectId).toBe(project.id);
      expect(ctx.sessionId).toBe('feature-payments');

      // 5. Link another project
      pm.init('/tmp/hardware-driver', 'hardware-driver');
      const hwProject = pm.list().find(p => p.name === 'hardware-driver');
      expect(hwProject).toBeDefined();

      if (hwProject) {
        cm.linkProject(project.id, hwProject.id, 'hw');
        
        // 6. Check boundaries
        const check = cm.checkBoundary('read', `${hwProject.id}:src/main.c`);
        expect(check.allowed).toBe(true);
        
        // Try to access hardware-driver without link (simulated by non-linked ID)
        const violation = cm.checkBoundary('read', 'unknown-project:src/main.c');
        expect(violation.allowed).toBe(false);
      }
    });

    it('should handle multiple stashes', () => {
      const cm = new ContextManager();
      cm.switch('p1', 's1');
      
      cm.stash('s1');
      cm.stash('s2');
      cm.stash('s3');
      
      const stashes = cm.listStashes();
      expect(stashes).toHaveLength(3);
      
      // Pop middle stash
      const targetId = stashes[1].id;
      cm.popStash(targetId);
      
      expect(cm.listStashes()).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should handle stash operations without context', () => {
      const cm = new ContextManager();
      const stash = cm.stash('test');
      expect(stash).toBeNull();
    });
  });
});
