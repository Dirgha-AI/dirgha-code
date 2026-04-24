// @ts-nocheck

/**
 * commands/curate.test.ts - Tests for curate and query commands
 * Sprint 7: Knowledge Graph Foundation
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getDB } from '../session/db.js';
import { randomUUID } from 'crypto';

describe('Knowledge Graph', () => {
  beforeAll(() => {
    const db = getDB();
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

  beforeEach(() => {
    const db = getDB();
    // Clean up test data
    db.exec('DELETE FROM fact_files');
    db.exec('DELETE FROM curated_facts');
  });

  afterAll(() => {
    // DB cleanup handled by process exit
  });

  describe('curate', () => {
    it('should create curated_facts table', () => {
      const db = getDB();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='curated_facts'"
      ).all() as any[];
      expect(tables.length).toBe(1);
    });

    it('should insert a fact with embedding', () => {
      const db = getDB();
      const id = randomUUID();
      const embedding = new Float32Array(64).fill(0.1);

      db.prepare(`
        INSERT INTO curated_facts (id, content, embedding, tags, project_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, 'Test fact content', Buffer.from(embedding.buffer), '["test"]', 'proj-123');

      const fact = db.prepare('SELECT * FROM curated_facts WHERE id = ?').get(id) as any;
      expect(fact).toBeTruthy();
      expect(fact.content).toBe('Test fact content');
      expect(fact.project_id).toBe('proj-123');
    });

    it('should associate files with facts', () => {
      const db = getDB();
      const factId = randomUUID();

      db.prepare(`
        INSERT INTO curated_facts (id, content, tags) VALUES (?, ?, ?)
      `).run(factId, 'Test content', '[]');

      db.prepare(`
        INSERT INTO fact_files (fact_id, file_path, line_start, line_end)
        VALUES (?, ?, ?, ?)
      `).run(factId, '/path/to/file.ts', 10, 20);

      const files = db.prepare('SELECT * FROM fact_files WHERE fact_id = ?').all(factId) as any[];
      expect(files.length).toBe(1);
      expect(files[0].file_path).toBe('/path/to/file.ts');
      expect(files[0].line_start).toBe(10);
      expect(files[0].line_end).toBe(20);
    });

    it('should filter by project_id', () => {
      const db = getDB();
      db.prepare(`INSERT INTO curated_facts (id, content, project_id) VALUES (?, ?, ?)`)
        .run(randomUUID(), 'Fact A', 'project-a');
      db.prepare(`INSERT INTO curated_facts (id, content, project_id) VALUES (?, ?, ?)`)
        .run(randomUUID(), 'Fact B', 'project-b');

      const results = db.prepare('SELECT * FROM curated_facts WHERE project_id = ?').all('project-a') as any[];
      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Fact A');
    });

    it('should filter by tags using JSON array contains', () => {
      const db = getDB();
      db.prepare(`INSERT INTO curated_facts (id, content, tags) VALUES (?, ?, ?)`)
        .run(randomUUID(), 'Fact with tag', '["important","todo"]');
      db.prepare(`INSERT INTO curated_facts (id, content, tags) VALUES (?, ?, ?)`)
        .run(randomUUID(), 'Fact without tag', '["other"]');

      const results = db.prepare("SELECT * FROM curated_facts WHERE tags LIKE ?").all('%"important"%') as any[];
      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Fact with tag');
    });
  });

  describe('query', () => {
    it('should retrieve facts ordered by date', () => {
      const db = getDB();
      db.prepare(`INSERT INTO curated_facts (id, content, created_at) VALUES (?, ?, datetime('now', '-1 day'))`)
        .run(randomUUID(), 'Older fact');
      db.prepare(`INSERT INTO curated_facts (id, content, created_at) VALUES (?, ?, datetime('now'))`)
        .run(randomUUID(), 'Newer fact');

      const results = db.prepare('SELECT * FROM curated_facts ORDER BY created_at DESC').all() as any[];
      expect(results.length).toBe(2);
      expect(results[0].content).toBe('Newer fact');
    });

    it('should handle NULL embeddings gracefully', () => {
      const db = getDB();
      db.prepare(`INSERT INTO curated_facts (id, content, embedding) VALUES (?, ?, ?)`)
        .run(randomUUID(), 'No embedding fact', null);

      const fact = db.prepare('SELECT * FROM curated_facts WHERE embedding IS NULL').get() as any;
      expect(fact).toBeTruthy();
      expect(fact.content).toBe('No embedding fact');
    });

    it('should delete facts and cascade to files', () => {
      const db = getDB();
      const factId = randomUUID();

      db.prepare(`INSERT INTO curated_facts (id, content) VALUES (?, ?)`).run(factId, 'To be deleted');
      db.prepare(`INSERT INTO fact_files (fact_id, file_path) VALUES (?, ?)`).run(factId, '/test/file.ts');

      db.prepare('DELETE FROM curated_facts WHERE id = ?').run(factId);

      const fact = db.prepare('SELECT * FROM curated_facts WHERE id = ?').get(factId);
      const file = db.prepare('SELECT * FROM fact_files WHERE fact_id = ?').get(factId);
      expect(fact).toBeUndefined();
      expect(file).toBeUndefined();
    });
  });
});
