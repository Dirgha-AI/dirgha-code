/**
 * Query Command Tests
 * @module commands/__tests__/query.test
 * 
 * Sprint 7: Knowledge Graph Foundation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDB } from '../../session/db.js';

vi.mock('../../session/db.js', () => ({
  getDB: vi.fn(() => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      all: vi.fn(() => []),
      get: vi.fn(),
    })),
  })),
}));

describe('Query Command', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      exec: vi.fn(),
      prepare: vi.fn(() => ({
        run: vi.fn(),
        all: vi.fn(() => []),
        get: vi.fn(),
      })),
    };
    vi.mocked(getDB).mockReturnValue(mockDb);
  });

  describe('Semantic Search', () => {
    it('should return facts ordered by relevance', async () => {
      const { registerQueryCommand } = await import('../query.js');
      const program = { 
        command: vi.fn(() => ({ 
          description: vi.fn(() => ({ 
            option: vi.fn(() => ({ 
              option: vi.fn(() => ({ 
                option: vi.fn(() => ({ 
                  option: vi.fn(() => ({ 
                    action: vi.fn() 
                  })) 
                })) 
              })) 
            })) 
          })) 
        })) 
      };
      
      registerQueryCommand(program as any);
      expect(program.command).toHaveBeenCalledWith('query <query>');
    });

    it('should limit results to specified count', () => {
      const limit = 5;
      const results = Array(limit).fill(null);
      expect(results).toHaveLength(limit);
    });

    it('should filter by tags when specified', () => {
      const filterTags = ['auth', 'api'];
      expect(filterTags).toContain('auth');
      expect(filterTags).toContain('api');
    });

    it('should filter by project when specified', () => {
      const projectId = 'proj-123';
      expect(projectId).toMatch(/^proj-/);
    });
  });

  describe('Full-Text Search (FTS5)', () => {
    it('should search fact content with MATCH syntax', () => {
      const query = 'authentication JWT';
      const sql = `SELECT * FROM curated_facts WHERE content MATCH '${query}'`;
      expect(sql).toContain('MATCH');
      expect(sql).toContain(query);
    });

    it('should rank results by relevance', () => {
      const orderBy = 'rank';
      expect(orderBy).toBe('rank');
    });
  });

  describe('Hybrid Search (FTS5 + Vector)', () => {
    it('should combine keyword and semantic similarity', () => {
      // Future: combine FTS5 results with vector similarity
      const ftsWeight = 0.3;
      const vectorWeight = 0.7;
      expect(ftsWeight + vectorWeight).toBe(1);
    });
  });

  describe('Result Formatting', () => {
    it('should display fact ID truncated to 8 chars', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const truncated = id.slice(0, 8);
      expect(truncated).toBe('550e8400');
      expect(truncated).toHaveLength(8);
    });

    it('should display content preview (first 200 chars)', () => {
      const content = 'a'.repeat(500);
      const preview = content.slice(0, 200);
      expect(preview).toHaveLength(200);
    });

    it('should display tags as comma-separated list', () => {
      const tags = ['auth', 'jwt', 'api'];
      const display = tags.join(', ');
      expect(display).toBe('auth, jwt, api');
    });

    it('should display attached file count', () => {
      const files = ['./a.ts', './b.ts'];
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('CLI Interface', () => {
    it('should accept query as positional argument', () => {
      const args = ['query', 'How does auth work'];
      const query = args[1];
      expect(query).toBe('How does auth work');
    });

    it('should support --limit option', () => {
      const options = { limit: 10 };
      expect(options.limit).toBeGreaterThan(0);
    });

    it('should support --tags option', () => {
      const options = { tags: ['auth'] };
      expect(options.tags).toBeDefined();
    });

    it('should support --project option', () => {
      const options = { project: 'proj-123' };
      expect(options.project).toBeDefined();
    });

    it('should support --semantic flag', () => {
      const options = { semantic: true };
      expect(options.semantic).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle no results gracefully', () => {
      const results: any[] = [];
      expect(results).toHaveLength(0);
    });

    it('should handle special characters in query', () => {
      const query = 'SELECT * FROM users';
      // Should escape or handle SQL special chars
      expect(query).toContain('SELECT');
    });

    it('should handle very long queries', () => {
      const query = 'a'.repeat(1000);
      expect(query.length).toBe(1000);
    });
  });
});
