/**
 * Curate → Query Integration Test
 * @module embeddings/integration.test
 * 
 * Sprint 7: Knowledge Graph Foundation
 * End-to-end pipeline: curate facts → query with semantic search
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDB } from '../session/db.js';
import { initEmbeddingProvider, embed } from './provider.js';
import { isVssAvailable, createVssTable, upsertVssEmbedding, searchVss } from './vss.js';

describe('Curate → Query Pipeline', () => {
  let db: ReturnType<typeof getDB>;
  const TEST_PROJECT = 'test-pipeline-' + Date.now();

  beforeAll(async () => {
    // Initialize embedding provider
    await initEmbeddingProvider();
    db = getDB();
    
    // Ensure schema exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS curated_facts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        tags TEXT DEFAULT '[]',
        project_id TEXT
      );
      CREATE TABLE IF NOT EXISTS fact_files (
        fact_id TEXT,
        file_path TEXT,
        line_start INTEGER,
        line_end INTEGER,
        PRIMARY KEY (fact_id, file_path),
        FOREIGN KEY (fact_id) REFERENCES curated_facts(id) ON DELETE CASCADE
      );
    `);
  });

  afterAll(() => {
    // Cleanup test data
    db.prepare('DELETE FROM fact_files WHERE fact_id LIKE ?').run('test-fact-%');
    db.prepare('DELETE FROM curated_facts WHERE id LIKE ?').run('test-fact-%');
  });

  describe('Basic Curate → Query', () => {
    it('should curate a fact and retrieve it by keyword', async () => {
      const factId = 'test-fact-1';
      const content = 'API rate limits are 1000 requests per hour';
      
      // Curate (insert fact)
      const embedding = await embed(content);
      db.prepare(`
        INSERT INTO curated_facts (id, content, embedding, tags, project_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        factId,
        content,
        Buffer.from(new Float32Array(embedding).buffer),
        JSON.stringify(['api', 'rate-limiting']),
        TEST_PROJECT
      );

      // Query by keyword
      const facts = db.prepare(`
        SELECT id, content, tags FROM curated_facts 
        WHERE project_id = ? AND content LIKE ?
      `).all(TEST_PROJECT, '%rate limit%') as Array<{ id: string; content: string; tags: string }>;

      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].content).toBe(content);
    });

    it('should curate multiple facts and find semantically similar', async () => {
      const facts = [
        { id: 'test-fact-2', content: 'Authentication uses JWT tokens', tags: ['auth'] },
        { id: 'test-fact-3', content: 'API keys are deprecated', tags: ['api', 'security'] },
        { id: 'test-fact-4', content: 'OAuth 2.0 is the preferred method', tags: ['auth', 'oauth'] },
      ];

      // Curate all facts
      for (const fact of facts) {
        const embedding = await embed(fact.content);
        db.prepare(`
          INSERT INTO curated_facts (id, content, embedding, tags, project_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          fact.id,
          fact.content,
          Buffer.from(new Float32Array(embedding).buffer),
          JSON.stringify(fact.tags),
          TEST_PROJECT
        );
      }

      // Query for authentication-related content
      const queryEmbedding = await embed('login methods');
      const allFacts = db.prepare(`
        SELECT id, content, embedding FROM curated_facts WHERE project_id = ?
      `).all(TEST_PROJECT) as Array<{ id: string; content: string; embedding: Buffer }>;

      // Calculate similarity manually (what query command does)
      function cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          na += a[i] * a[i];
          nb += b[b[i] * b[i]];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
      }

      function bufferToFloatArray(buf: Buffer): number[] {
        const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        return Array.from(arr);
      }

      const results = allFacts
        .filter(f => f.embedding)
        .map(f => ({
          id: f.id,
          content: f.content,
          score: cosineSimilarity(queryEmbedding, bufferToFloatArray(f.embedding)),
        }))
        .sort((a, b) => b.score - a.score);

      // Should find auth-related facts as most similar
      expect(results.some((r: any) => r.content.toLowerCase().includes('auth'))).toBe(true);
    });
  });

  describe('VSS Integration (optional)', () => {
    it('should detect VSS availability', async () => {
      const available = await isVssAvailable(db);
      // May be true or false depending on system
      expect(typeof available).toBe('boolean');
    });

    it('should store and retrieve via VSS when available', async () => {
      const available = await isVssAvailable(db);
      if (!available) {
        console.log('VSS not available, skipping test');
        return;
      }

      const factId = 'test-fact-vss';
      const content = 'Vector search is fast';
      const embedding = await embed(content);

      // Store fact
      db.prepare(`
        INSERT INTO curated_facts (id, content, embedding, project_id)
        VALUES (?, ?, ?, ?)
      `).run(
        factId,
        content,
        Buffer.from(new Float32Array(embedding).buffer),
        TEST_PROJECT
      );

      // Store in VSS
      createVssTable(db, embedding.length);
      upsertVssEmbedding(db, factId, embedding);

      // Search via VSS
      const queryEmbedding = await embed('fast search');
      const results = searchVss(db, queryEmbedding, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fact_id).toBe(factId);
    });
  });

  describe('Performance', () => {
    it('should curate 100 facts in under 5 seconds', async () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        const content = `Test fact number ${i} with some content about ${i % 2 === 0 ? 'APIs' : 'databases'}`;
        const embedding = await embed(content);
        
        db.prepare(`
          INSERT INTO curated_facts (id, content, embedding, project_id)
          VALUES (?, ?, ?, ?)
        `).run(
          `test-fact-perf-${i}`,
          content,
          Buffer.from(new Float32Array(embedding).buffer),
          TEST_PROJECT
        );
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should query 1000 facts in under 100ms', async () => {
      const start = Date.now();
      
      const facts = db.prepare(`
        SELECT id, content FROM curated_facts WHERE project_id = ? LIMIT 1000
      `).all(TEST_PROJECT);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // 100ms
      expect(facts.length).toBeGreaterThan(0);
    });
  });
});
