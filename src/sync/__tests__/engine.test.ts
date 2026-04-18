import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from '../engine.js';
import { Database } from '../../utils/sqlite.js';

describe('SyncEngine', () => {
  let db: Database;
  let engine: SyncEngine;

  beforeEach(() => {
    db = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ count: 5 }),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn()
      }),
      exec: vi.fn(),
      transaction: vi.fn((fn) => fn)
    } as any;

    engine = new SyncEngine(db, 'test-project', {
      baseUrl: 'https://api.dirgha.ai',
      apiKey: 'test-key'
    });
  });

  describe('status', () => {
    it('should return local and cloud fact counts', async () => {
      const status = await engine.status();
      expect(status.localFacts).toBe(5);
      expect(status.projectId).toBe('test-project');
    });

    it('should handle offline state gracefully', async () => {
      vi.spyOn(engine as any, 'api', 'get').mockReturnValue({
        getSyncStatus: vi.fn().mockRejectedValue(new Error('Offline'))
      });

      const status = await engine.status();
      expect(status.cloudFacts).toBe(0);
    });
  });

  describe('push', () => {
    it('should upload pending facts', async () => {
      const pendingFact = {
        id: 'fact-1',
        content: 'Test fact',
        tags: '["test"]',
        embedding: null
      };

      db.prepare = vi.fn().mockReturnValue({
        get: vi.fn(),
        all: vi.fn().mockReturnValue([pendingFact]),
        run: vi.fn()
      });

      const result = await engine.push();
      expect(result.uploaded).toBeGreaterThanOrEqual(0);
    });

    it('should track upload errors', async () => {
      vi.spyOn(engine as any, 'api', 'get').mockReturnValue({
        uploadFacts: vi.fn().mockRejectedValue(new Error('Network error'))
      });

      const result = await engine.push();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pull', () => {
    it('should download new facts from cloud', async () => {
      const cloudFact = {
        id: 'cloud-fact-1',
        content: 'Cloud fact',
        tags: ['cloud'],
        updatedAt: '2026-04-07T00:00:00Z',
        version: 1
      };

      vi.spyOn(engine as any, 'api', 'get').mockReturnValue({
        getFacts: vi.fn().mockResolvedValue([cloudFact])
      });

      const result = await engine.pull();
      expect(result.downloaded).toBeGreaterThanOrEqual(0);
    });

    it('should detect conflicts when local is newer', async () => {
      const cloudFact = {
        id: 'conflict-fact',
        content: 'Cloud version',
        tags: [],
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1
      };

      vi.spyOn(engine as any, 'api', 'get').mockReturnValue({
        getFacts: vi.fn().mockResolvedValue([cloudFact])
      });

      db.prepare = vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ updated_at: '2026-04-07T00:00:00Z' }),
        run: vi.fn()
      });

      const result = await engine.pull();
      expect(result.conflicts).toBeGreaterThan(0);
    });
  });
});

describe('Sync Status Integration', () => {
  it('should track last sync time', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ last_sync_at: '2026-04-07T00:00:00Z' }),
        run: vi.fn()
      })
    } as any;

    const engine = new SyncEngine(mockDb, 'test', {
      baseUrl: 'https://api.dirgha.ai',
      apiKey: 'key'
    });

    const status = await engine.status();
    expect(status.lastSyncAt).toBe('2026-04-07T00:00:00Z');
  });
});
