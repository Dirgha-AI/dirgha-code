import { describe, it, expect } from 'vitest';
import { hybridSearch } from '../hybrid.js';
import { Database } from '../../utils/sqlite.js';

describe('hybridSearch', () => {
  const createMockDb = (facts: any[]) => {
    return {
      prepare: () => ({
        all: () => facts
      })
    } as unknown as Database;
  };

  describe('keyword search', () => {
    it('should find facts by keyword match', () => {
      const facts = [
        { id: '1', content: 'React hooks are powerful', tags: '[]', rank: 0.5 },
        { id: '2', content: 'Vue composition API', tags: '[]', rank: 0.3 }
      ];
      const db = createMockDb(facts);

      const results = hybridSearch(db, {
        query: 'React hooks',
        projectId: 'test'
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should calculate relevance scores', () => {
      const facts = [
        { id: '1', content: 'Test content', tags: '[]', rank: 1.0 }
      ];
      const db = createMockDb(facts);

      const results = hybridSearch(db, {
        query: 'test',
        projectId: 'test',
        keywordWeight: 1.0,
        semanticWeight: 0
      });

      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].type).toBe('keyword');
    });
  });

  describe('tag filtering', () => {
    it('should filter results by tags', () => {
      const facts = [
        { id: '1', content: 'API design', tags: '["backend", "api"]', rank: 0.5 },
        { id: '2', content: 'Button component', tags: '["frontend", "ui"]', rank: 0.4 }
      ];
      const db = createMockDb(facts);

      const results = hybridSearch(db, {
        query: 'design',
        projectId: 'test',
        tags: ['backend']
      });

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('backend');
    });
  });

  describe('result ranking', () => {
    it('should limit results', () => {
      const facts = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        content: `Fact ${i}`,
        tags: '[]',
        rank: 0.5 - i * 0.01
      }));
      const db = createMockDb(facts);

      const results = hybridSearch(db, {
        query: 'fact',
        projectId: 'test',
        limit: 5
      });

      expect(results).toHaveLength(5);
    });

    it('should sort by score descending', () => {
      const facts = [
        { id: '1', content: 'High relevance', tags: '[]', rank: 0.1 },
        { id: '2', content: 'Low relevance', tags: '[]', rank: 0.9 }
      ];
      const db = createMockDb(facts);

      const results = hybridSearch(db, {
        query: 'relevance',
        projectId: 'test'
      });

      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });
});
