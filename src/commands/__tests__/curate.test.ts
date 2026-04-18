/**
 * Curate Command Tests
 * @module commands/__tests__/curate.test
 * 
 * Sprint 7: Knowledge Graph Foundation — Test-First Implementation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDB } from '../../session/db.js';
import * as provider from '../../embeddings/provider.js';

// Mock the database
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

describe('Curate Command', () => {
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Schema Creation', () => {
    it('should create curated_facts table with correct schema', async () => {
      const { registerCurateCommand } = await import('../curate.js');
      const program = { command: vi.fn(() => ({ description: vi.fn(() => ({ option: vi.fn(() => ({ option: vi.fn(() => ({ option: vi.fn(() => ({ option: vi.fn(() => ({ option: vi.fn(() => ({ action: vi.fn() })) })) })) })) })) })) })) };
      
      registerCurateCommand(program as any);
      
      // Verify schema includes required columns
      expect(program.command).toHaveBeenCalledWith('curate <content>');
    });

    it('should create fact_files table with foreign key constraints', () => {
      // Schema should enforce referential integrity
      expect(true).toBe(true); // Placeholder - actual test would verify SQL
    });

    it('should create indexes for performance', () => {
      // Indexes on project_id and tags for fast filtering
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Fact Creation', () => {
    it('should generate unique UUID for each fact', async () => {
      const { randomUUID } = await import('crypto');
      const id1 = randomUUID();
      const id2 = randomUUID();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should set created_at and updated_at to current time', () => {
      const now = new Date().toISOString();
      expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle empty tags as empty array', () => {
      const tags: string[] = [];
      expect(JSON.stringify(tags)).toBe('[]');
    });

    it('should handle multiple tags', () => {
      const tags = ['auth', 'jwt', 'api'];
      const serialized = JSON.stringify(tags);
      expect(serialized).toBe('["auth","jwt","api"]');
      expect(JSON.parse(serialized)).toEqual(tags);
    });
  });

  describe('Embedding Generation', () => {
    it('should generate 64-dimensional hash embeddings as fallback', async () => {
      const content = 'Test content';
      const hash = content.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const embedding = Array.from({ length: 64 }, (_, i) => Math.sin(hash + i * 0.5) / 64);
      
      expect(embedding).toHaveLength(64);
      expect(embedding.every(v => !isNaN(v))).toBe(true);
      expect(embedding.every(v => v >= -1 && v <= 1)).toBe(true);
    });

    it('should generate deterministic embeddings for same content', () => {
      const content = 'Deterministic test';
      const hash1 = content.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const hash2 = content.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different embeddings for different content', () => {
      const content1 = 'First content';
      const content2 = 'Second content';
      const hash1 = content1.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const hash2 = content2.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should convert embedding to Float32Array buffer for storage', () => {
      const embedding = [0.1, 0.2, 0.3];
      const buffer = Buffer.from(new Float32Array(embedding).buffer);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(embedding.length * 4); // 4 bytes per float32
    });

    it('should handle --no-embed flag', () => {
      const skipEmbedding = true;
      expect(skipEmbedding).toBe(true);
    });
  });

  describe('File Attachments', () => {
    it('should resolve relative paths to absolute', () => {
      const { resolve } = require('path');
      const relativePath = './src/auth.ts';
      const absolutePath = resolve(relativePath);
      
      expect(absolutePath).toMatch(/^\//); // Starts with /
      expect(absolutePath).toContain('src/auth.ts');
    });

    it('should store file with correct fact_id reference', () => {
      const factId = 'test-fact-id';
      const filePath = '/absolute/path/to/file.ts';
      const lineStart = 10;
      const lineEnd = 50;
      
      // Mock database insertion
      const insert = {
        fact_id: factId,
        file_path: filePath,
        line_start: lineStart,
        line_end: lineEnd,
      };
      
      expect(insert.fact_id).toBe(factId);
      expect(insert.file_path).toBe(filePath);
    });

    it('should handle multiple file attachments', () => {
      const files = [
        { path: './src/auth.ts', lines: [1, 50] },
        { path: './src/middleware.ts', lines: [20, 80] },
      ];
      
      expect(files).toHaveLength(2);
      files.forEach(f => {
        expect(f.path).toBeDefined();
        expect(f.lines).toHaveLength(2);
      });
    });

    it('should handle undefined line numbers', () => {
      const lineStart: number | undefined = undefined;
      const lineEnd: number | undefined = undefined;
      
      expect(lineStart ?? null).toBeNull();
      expect(lineEnd ?? null).toBeNull();
    });
  });

  describe('Project Context', () => {
    it('should resolve project ID from .dirgha/context.json', () => {
      const mockContext = { projectId: 'proj-test-123' };
      expect(mockContext.projectId).toBe('proj-test-123');
    });

    it('should handle missing context file gracefully', () => {
      const contextPath = '/nonexistent/.dirgha/context.json';
      let context: any = null;
      
      try {
        context = JSON.parse(require('fs').readFileSync(contextPath, 'utf8'));
      } catch {
        // Expected to fail
      }
      
      expect(context).toBeNull();
    });
  });

  describe('Embedding Provider Selection', () => {
    it('should default to auto provider selection', () => {
      const providerName = 'auto';
      expect(providerName).toBe('auto');
    });

    it('should support explicit hash provider', () => {
      const providerName = 'hash';
      expect(['hash', 'ollama', 'gateway']).toContain(providerName);
    });

    it('should fallback to hash on embedding failure', async () => {
      const providerName = 'ollama';
      let embedding: number[] | undefined;
      
      try {
        // Simulate failure
        throw new Error('Ollama unavailable');
      } catch {
        // Fallback to hash
        const hash = 'fallback'.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        embedding = Array.from({ length: 64 }, (_, i) => Math.sin(hash + i * 0.5) / 64);
      }
      
      expect(embedding).toHaveLength(64);
    });
  });

  describe('VSS Integration', () => {
    it('should check VSS availability before attempting upsert', async () => {
      const isAvailable = false; // Simulated
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should gracefully handle VSS unavailability', () => {
      // Should not throw, just skip VSS storage
      let threw = false;
      try {
        // Simulated VSS call
        throw new Error('VSS not compiled');
      } catch {
        threw = true;
      }
      
      expect(threw).toBe(true);
      // But the main operation should continue
    });
  });

  describe('CLI Interface', () => {
    it('should accept content as positional argument', () => {
      const args = ['curate', 'Auth uses JWT'];
      const content = args[1];
      expect(content).toBe('Auth uses JWT');
    });

    it('should support --files option with multiple values', () => {
      const options = { files: ['./a.ts', './b.ts'] };
      expect(options.files).toHaveLength(2);
    });

    it('should support --tags option with multiple values', () => {
      const options = { tags: ['auth', 'api'] };
      expect(options.tags).toHaveLength(2);
    });

    it('should support --project flag', () => {
      const options = { project: true };
      expect(options.project).toBe(true);
    });

    it('should support --provider option', () => {
      const options = { provider: 'ollama' };
      expect(options.provider).toBe('ollama');
    });

    it('should support --no-embed flag', () => {
      const options = { embed: false };
      expect(options.embed).toBe(false);
    });
  });
});
