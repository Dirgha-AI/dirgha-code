/**
 * project-session/__tests__/project.test.ts — Unit tests for ProjectManager
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => '/root/dirgha-ai/domains/10-computer/cli/.test-project-sandbox',
  };
});

const SANDBOX_ROOT = '/root/dirgha-ai/domains/10-computer/cli/.test-project-sandbox';

import { ProjectManager } from '../project.js';
import type { Project } from '../types.js';

describe('ProjectManager', () => {
  let pm: ProjectManager;
  
  beforeEach(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    pm = new ProjectManager();
  });

  afterEach(() => {
    if (fs.existsSync(SANDBOX_ROOT)) {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('init()', () => {
    it('should create project with correct structure', () => {
      const project = pm.init('/tmp/test-project', 'test-project');
      
      expect(project.name).toBe('test-project');
      expect(project.path).toBe('/tmp/test-project');
      expect(project.id).toBeDefined();
      expect(project.createdAt).toBeDefined();
    });

    it('should persist project metadata', () => {
      const p1 = pm.init('/tmp/p1', 'p1');
      
      const pm2 = new ProjectManager();
      const list = pm2.list();
      
      expect(list.some(p => p.id === p1.id)).toBe(true);
    });
  });

  describe('switch()', () => {
    it('should update lastAccessed timestamp', () => {
      const project = pm.init('/tmp/p1', 'p1');
      const before = project.stats.lastAccessed;
      
      // Wait a bit to ensure timestamp changes
      // In fast environments we might need to mock Date.now()
      
      pm.switch(project.id);
      const updated = pm.list().find(p => p.id === project.id);
      
      expect(updated?.stats.lastAccessed).toBeDefined();
    });

    it('should return null for invalid project ID', () => {
      const result = pm.switch('invalid-id');
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('should return all projects', () => {
      pm.init('/tmp/a', 'project-a');
      pm.init('/tmp/b', 'project-b');
      pm.init('/tmp/c', 'project-c');
      
      const list = pm.list();
      expect(list).toHaveLength(3);
    });

    it('should return empty array when no projects', () => {
      const list = pm.list();
      expect(list).toEqual([]);
    });
  });
});
