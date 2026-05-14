import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../session.js';

describe('SessionImpl', () => {
  let tmpDir: string;
  let store: SessionStore;
  const sessionId = 'test-session';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'session-test-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('T01 message_filter_no_compaction', () => {
    it('returns all messages when no compaction entry exists', async () => {
      const sess = await store.create(sessionId);
      await sess.append({
        type: 'message',
        ts: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'hello' },
      });
      await sess.append({
        type: 'message',
        ts: '2026-01-02T00:00:00.000Z',
        message: { role: 'assistant', content: 'world' },
      });
      const msgs = await sess.messages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe('hello');
      expect(msgs[1].content).toBe('world');
    });
  });

  describe('T02 message_filter_with_compaction', () => {
    it('filters out messages before compaction threshold', async () => {
      const sess = await store.create(sessionId);
      // Write old messages
      await sess.append({
        type: 'message',
        ts: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'old' },
      });
      // Insert compaction entry
      await sess.append({
        type: 'compaction',
        ts: '2026-01-02T00:00:00.000Z',
        keptFrom: '2026-01-02T00:00:00.000Z',
        summary: 's',
      });
      // Write new messages (after keptFrom)
      await sess.append({
        type: 'message',
        ts: '2026-01-03T00:00:00.000Z',
        message: { role: 'user', content: 'new' },
      });
      const msgs = await sess.messages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('new');
    });
  });

  describe('T03 getCompactionThreshold_none', () => {
    it('returns null when no compaction entry exists', async () => {
      const sess = await store.create(sessionId);
      await sess.append({
        type: 'message',
        ts: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'a' },
      });
      const threshold = await sess.getCompactionThreshold();
      expect(threshold).toBeNull();
    });
  });

  describe('T04 getCompactionThreshold_returns_latest', () => {
    it('returns the latest keptFrom among multiple compaction entries', async () => {
      const sess = await store.create(sessionId);
      await sess.append({
        type: 'compaction',
        ts: '2026-01-01T00:00:00.000Z',
        keptFrom: '2026-01-01T00:00:00.000Z',
        summary: 'a',
      });
      await sess.append({
        type: 'compaction',
        ts: '2026-01-02T00:00:00.000Z',
        keptFrom: '2026-01-02T00:00:00.000Z',
        summary: 'b',
      });
      await sess.append({
        type: 'compaction',
        ts: '2026-01-03T00:00:00.000Z',
        keptFrom: '2026-01-03T00:00:00.000Z',
        summary: 'c',
      });
      const threshold = await sess.getCompactionThreshold();
      expect(threshold).toBe('2026-01-03T00:00:00.000Z');
    });
  });

  describe('T05 reconcile_runs_without_crash', () => {
    it('calls reconcile and does not throw despite possible database absence', async () => {
      const sess = await store.create(sessionId);
      await sess.append({
        type: 'message',
        ts: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'test' },
      });
      // reconcile is best-effort and should not throw
      await expect(sess.reconcile()).resolves.toBeUndefined();
    });
  });

  describe('T06 replay_yields_all_entries_including_compaction', () => {
    it('yields all raw entries including compaction entries', async () => {
      const sess = await store.create(sessionId);
      await sess.append({
        type: 'message',
        ts: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'm1' },
      });
      await sess.append({
        type: 'compaction',
        ts: '2026-01-02T00:00:00.000Z',
        keptFrom: '2026-01-02T00:00:00.000Z',
        summary: 's',
      });
      await sess.append({
        type: 'message',
        ts: '2026-01-03T00:00:00.000Z',
        message: { role: 'user', content: 'm2' },
      });
      const entries: any[] = [];
      for await (const entry of sess.replay()) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(3);
      expect(entries[0].type).toBe('message');
      expect((entries[0] as any).message.content).toBe('m1');
      expect(entries[1].type).toBe('compaction');
      expect((entries[1] as any).keptFrom).toBe('2026-01-02T00:00:00.000Z');
      expect(entries[2].type).toBe('message');
      expect((entries[2] as any).message.content).toBe('m2');
    });
  });
});
