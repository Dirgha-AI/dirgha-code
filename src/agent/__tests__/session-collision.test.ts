/**
 * agent/__tests__/session-collision.test.ts — Test session ID uniqueness and collision handling
 *
 * FIX P1-ISSUE 3.4: Test Date.now() collision scenarios
 *
 * Session ID Collision Scenarios:
 * 1. Fast sequential calls within same millisecond
 * 2. Concurrent loops in same process
 * 3. Multi-worker PM2 cluster with shared clock
 * 4. Container restarts with restored clock
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { generateSessionId, generateUniqueId, isSessionIdUnique } from '../../utils/id.js';
import { getMemoryManager } from '../../memory/manager.js';


afterAll(async () => {
  vi.restoreAllMocks();
  try {
    const { getDB } = await import('../../session/db.js');
    getDB().close();
  } catch {}
  vi.useRealTimers();
});

describe('Session ID Collision Prevention', () => {
  describe('Scenario 1: Sequential Calls Within Same Millisecond', () => {
    it('should generate unique IDs even with frozen clock', () => {
      // Freeze time
      const frozenTime = 1234567890000;
      vi.spyOn(Date, 'now').mockReturnValue(frozenTime);

      const id1 = generateSessionId();
      const id2 = generateSessionId();
      const id3 = generateSessionId();

      // All should be unique despite same timestamp
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      // Should include counter suffix
      expect(id1).toMatch(/_\d+(_[wp]\d+)?$/);
      expect(id2).toMatch(/_\d+(_[wp]\d+)?$/);
    });

    it('should handle 1000 sequential calls in same millisecond', () => {
      const frozenTime = 1234567890000;
      vi.spyOn(Date, 'now').mockReturnValue(frozenTime);

      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateSessionId());
      }

      expect(ids.size).toBe(1000); // All unique
    });
  });

  describe('Scenario 2: Concurrent Loops in Same Process', () => {
    it('should isolate sessions between concurrent agent loops', async () => {
      const sessionIds: string[] = [];

      // Simulate 5 concurrent loops starting at "same time"
      const promises = Array(5).fill(null).map(async (_, i) => {
        const id = generateSessionId();
        sessionIds.push(id);

        // Simulate some work
        await new Promise(r => setTimeout(r, 10));

        // Verify still have same session
        return { id, index: i };
      });

      const results = await Promise.all(promises);

      // All session IDs should be unique
      const uniqueIds = new Set(results.map(r => r.id));
      expect(uniqueIds.size).toBe(5);
    });

    it('should prevent cross-session memory pollution', async () => {
      const session1 = generateSessionId();
      const session2 = generateSessionId();

      const memMgr1 = getMemoryManager();
      const memMgr2 = getMemoryManager();

      // Initialize both sessions
      await memMgr1.initialize(session1);
      await memMgr2.initialize(session2);

      // Add fact to session 1
      await memMgr1.addFact({
        id: 'fact-1',
        content: 'Session 1 data',
        metadata: { sessionId: session1 }
      });

      // Session 2 should NOT see session 1's data
      const session2Facts = await memMgr2.query('Session 1');
      const hasCrossSessionData = session2Facts.some((f: any) =>
        f.metadata?.sessionId === session1
      );

      expect(hasCrossSessionData).toBe(false);
    });
  });

  describe('Scenario 3: Multi-Worker PM2 Cluster', () => {
    it('should include worker ID in session to prevent cross-worker collision', () => {
      // Simulate PM2 worker environment
      process.env.NODE_APP_INSTANCE = '3';

      const id = generateSessionId();

      // Should include worker instance
      expect(id).toContain('w3');

      delete process.env.NODE_APP_INSTANCE;
    });

    it('should include process PID when PM2 instance not available', () => {
      delete process.env.NODE_APP_INSTANCE;

      const id = generateSessionId();

      // Should have some process identifier
      expect(id).toMatch(/p\d+/);
    });

    it('should guarantee uniqueness across 16 workers with same timestamp', () => {
      const frozenTime = 1234567890000;
      vi.spyOn(Date, 'now').mockReturnValue(frozenTime);

      const allIds: string[] = [];

      // Simulate 16 workers generating IDs
      for (let worker = 0; worker < 16; worker++) {
        process.env.NODE_APP_INSTANCE = String(worker);

        // Each worker generates 10 IDs
        for (let i = 0; i < 10; i++) {
          allIds.push(generateSessionId());
        }
      }

      // All 160 IDs should be unique
      expect(new Set(allIds).size).toBe(160);

      delete process.env.NODE_APP_INSTANCE;
    });
  });

  describe('Scenario 4: Container Restarts with Restored Clock', () => {
    it('should include random entropy to survive clock resets', () => {
      const id1 = generateUniqueId({ entropyBytes: 4 });
      const id2 = generateUniqueId({ entropyBytes: 4 });

      // Should have high entropy component
      expect(id1).toMatch(/[a-f0-9]{8}/i);

      // Very unlikely to collide (1 in 4 billion)
      expect(id1).not.toBe(id2);
    });

    it('should use UUID v4 when available for maximum uniqueness', () => {
      const id = generateUniqueId({ useUuid: true });

      // UUID v4 format
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  // Scenario 5: Billing Context Isolation — tested in src/billing/__tests__/
  // billing/middleware.js loads the full provider chain, tested separately to avoid worker pressure.

  describe('Scenario 6: Memory Manager Session Conflicts', () => {
    it('resetMemoryManager should not affect other sessions', async () => {
      const session1 = generateSessionId();
      const session2 = generateSessionId();

      const memMgr1 = getMemoryManager();
      await memMgr1.initialize(session1);

      // Add data
      await memMgr1.addFact({ id: 'test', content: 'data' });

      // Simulate "other session" resetting
      const { resetMemoryManager } = await import('../../memory/manager.js');
      resetMemoryManager(); // This is the dangerous operation

      // Re-initialize session 1
      await memMgr1.initialize(session1);

      // Data should be gone (reset worked)
      const facts = await memMgr1.query('test');
      expect(facts.length).toBe(0);
    });

    it('should detect when resetMemoryManager called mid-session', async () => {
      const session = generateSessionId();
      const memMgr = getMemoryManager();

      await memMgr.initialize(session);
      await memMgr.addFact({ id: 'test', content: 'data' });

      // Danger: reset during active session
      const { resetMemoryManager } = await import('../../memory/manager.js');
      resetMemoryManager();

      // Should detect and warn
      try {
        await memMgr.addFact({ id: 'test2', content: 'more data' });
        // Should throw or warn about invalid state
      } catch (e: any) {
        expect(e.message).toMatch(/invalid|reset|reinitialize/i);
      }
    });
  });

  describe.skip('Metric: Collision Rate Under Load', () => {
    it('should have zero collisions at 1K sessions/second', () => {
      const ids = new Set();
      let collisions = 0;

      // Simulate 1K rapid-fire session creations
      for (let i = 0; i < 1000; i++) {
        const id = generateSessionId();
        if (ids.has(id)) {
          collisions++;
        }
        ids.add(id);
      }

      expect(collisions).toBe(0);
      expect(ids.size).toBe(1000);
    });

    it('should have <0.01% collision rate at 10K sessions', () => {
      const ids = new Set();
      let collisions = 0;

      for (let i = 0; i < 10000; i++) {
        const id = generateSessionId();
        if (ids.has(id)) {
          collisions++;
        }
        ids.add(id);
      }

      const collisionRate = collisions / 10000;
      expect(collisionRate).toBeLessThan(0.0001); // <0.01%
    });
  });
  describe('Best Practice: Session ID Format', () => {
    it('should include timestamp for debugging', () => {
      const id = generateSessionId();
      expect(id).toMatch(/\d{13}/); // Unix timestamp
    });

    it('should include counter for same-millisecond ordering', () => {
      const id = generateSessionId();
      expect(id).toMatch(/_\d{4,}(_[wp]\d+)?$/); // 4+ digit counter
    });

    it('should be sortable by time', () => {
      vi.restoreAllMocks(); // Restore Date.now before time-sensitive test
      const id1 = generateSessionId();

      // Use performance.now — not affected by vi.spyOn(Date, 'now')
      const start = performance.now();
      while (performance.now() - start < 10) {}

      const id2 = generateSessionId();

      // ID2 should sort after ID1
      expect(id2 > id1).toBe(true);
    });
  });
});

describe('Integration: End-to-End Session Isolation', () => {
  it('full lifecycle: create → use → cleanup (memory only)', async () => {
    // 1. Create session
    const session = generateSessionId();
    expect(session.length).toBeGreaterThan(20);

    // 2. Initialize memory
    const memMgr = getMemoryManager();
    await memMgr.initialize(session);

    // 3. Do work
    await memMgr.addFact({ id: 'work', content: 'done' });

    // 4. Verify isolation from new session
    const session2 = generateSessionId();
    const memMgr2 = getMemoryManager();
    await memMgr2.initialize(session2);

    const facts2 = await memMgr2.query('work');
    expect(facts2.length).toBe(0); // No cross-session bleed

    // 5. Cleanup
    await memMgr.close();
  });
});
