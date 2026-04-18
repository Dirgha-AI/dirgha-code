/**
 * project-session/__tests__/session.test.ts — Unit tests for SessionManager
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../session.js';

describe('SessionManager', () => {
  let sm: SessionManager;
  const PROJECT_ID = 'test-project-123';
  
  beforeEach(() => {
    sm = new SessionManager();
  });

  describe('create()', () => {
    it('should create session with correct ID format', () => {
      const session = sm.create(PROJECT_ID, 'main');
      
      expect(session.id).toBe(`${PROJECT_ID}:main`);
      expect(session.name).toBe('main');
      expect(session.projectId).toBe(PROJECT_ID);
      expect(session.status).toBe('active');
    });

    it('should initialize compressed context', () => {
      const session = sm.create(PROJECT_ID, 'test');
      
      expect(session.compressed.version).toBe(1);
      expect(session.compressed.compressedTokens).toBe(10);
      expect(session.compressed.summary).toContain('test');
    });

    it('should create empty tree and scratchpad', () => {
      const session = sm.create(PROJECT_ID, 'test');
      
      expect(session.tree).toEqual([]);
      expect(session.scratchpad).toEqual([]);
    });
  });

  describe('fork()', () => {
    it('should create forked session with parent reference', () => {
      const parent = sm.create(PROJECT_ID, 'main');
      const forked = sm.fork(PROJECT_ID, parent.id, 'feature-branch');
      
      expect(forked).toBeDefined();
      expect(forked?.parentId).toBe(parent.id);
      expect(forked?.name).toBe('feature-branch');
    });

    it('should inherit compressed context from parent', () => {
      const parent = sm.create(PROJECT_ID, 'main');
      const forked = sm.fork(PROJECT_ID, parent.id, 'fork');
      
      expect(forked?.compressed.summary).toContain('FORK');
      expect(forked?.compressed.summary).toContain('main');
    });

    it('should return null for non-existent parent', () => {
      const result = sm.fork(PROJECT_ID, 'non-existent', 'new');
      
      expect(result).toBeNull();
    });
  });

  describe('merge()', () => {
    it('should combine scratchpads from both sessions', () => {
      const target = sm.create(PROJECT_ID, 'main');
      const source = sm.create(PROJECT_ID, 'feature');
      
      // Add entries
      target.scratchpad.push({ timestamp: '2024-01-01', action: 'test', result: 'success' });
      source.scratchpad.push({ timestamp: '2024-01-02', action: 'code', result: 'success' });
      
      const merged = sm.merge(source.id, target.id);
      
      expect(merged?.scratchpad).toHaveLength(2);
    });

    it('should mark source as merged', () => {
      const target = sm.create(PROJECT_ID, 'main');
      const source = sm.create(PROJECT_ID, 'feature');
      
      sm.merge(source.id, target.id);
      
      expect(sm.get(source.id)?.status).toBe('merged');
    });

    it('should update compressed summary', () => {
      const target = sm.create(PROJECT_ID, 'main');
      const source = sm.create(PROJECT_ID, 'feature');
      
      const merged = sm.merge(source.id, target.id);
      
      expect(merged?.compressed.summary).toContain('MERGED');
      expect(merged?.compressed.version).toBe(2);
    });
  });

  describe('list()', () => {
    it('should filter sessions by project', () => {
      sm.create('project-a', 'main');
      sm.create('project-a', 'dev');
      sm.create('project-b', 'main');
      
      const list = sm.list('project-a');
      
      expect(list).toHaveLength(2);
      expect(list.every(s => s.projectId === 'project-a')).toBe(true);
    });
  });

  describe('archive()', () => {
    it('should mark session as archived', () => {
      const session = sm.create(PROJECT_ID, 'temp');
      
      const result = sm.archive(session.id);
      
      expect(result).toBe(true);
      expect(sm.get(session.id)?.status).toBe('archived');
    });

    it('should return false for non-existent session', () => {
      const result = sm.archive('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('diff()', () => {
    it('should identify different files between sessions', () => {
      const a = sm.create(PROJECT_ID, 'session-a');
      const b = sm.create(PROJECT_ID, 'session-b');
      
      a.tree.push({ path: 'file-a.ts', type: 'file', importance: 0.8, lastAccessed: '2024-01-01', tokenCount: 100 });
      b.tree.push({ path: 'file-b.ts', type: 'file', importance: 0.9, lastAccessed: '2024-01-02', tokenCount: 200 });
      
      const diff = sm.diff(a.id, b.id);
      
      expect(diff.files).toContain('file-a.ts');
      expect(diff.files).toContain('file-b.ts');
    });
  });
});
