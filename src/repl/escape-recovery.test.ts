/**
 * Tests for escape-recovery.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  resetEscapeState,
  wasEscapePressed,
  getCurrentCheckpointId,
} from './escape-recovery.js';
import type { Message } from '../types.js';

const TEST_SESSIONS_DIR = join(homedir(), '.dirgha', 'sessions');

describe('Escape Recovery', () => {
  // Clean up test files before and after
  beforeEach(() => {
    resetEscapeState();
    // Clean any existing test checkpoints
    if (existsSync(TEST_SESSIONS_DIR)) {
      const files = readdirSync(TEST_SESSIONS_DIR).filter(f => f.startsWith('session-'));
      files.forEach(f => {
        try {
          unlinkSync(join(TEST_SESSIONS_DIR, f));
        } catch { /* ignore */ }
      });
    }
  });

  afterEach(() => {
    resetEscapeState();
  });

  describe('saveCheckpoint', () => {
    it('should save a checkpoint to disk', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      
      const id = saveCheckpoint(messages, 'gpt-4', 150);
      
      expect(id).toBeDefined();
      expect(id).toMatch(/^session-\d+(-\d+)?$/);
      expect(existsSync(join(TEST_SESSIONS_DIR, `${id}.json`))).toBe(true);
    });

    it('should create sessions directory if it does not exist', () => {
      const messages: Message[] = [{ role: 'user', content: 'Test' }];
      
      saveCheckpoint(messages, 'gpt-4', 50);
      
      expect(existsSync(TEST_SESSIONS_DIR)).toBe(true);
    });

    it('should include all checkpoint fields', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message' },
      ];
      
      const id = saveCheckpoint(messages, 'claude-3.5', 250, '/test/dir');
      const checkpoint = loadCheckpoint(id);
      
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.id).toBe(id);
      expect(checkpoint?.model).toBe('claude-3.5');
      expect(checkpoint?.tokensUsed).toBe(250);
      expect(checkpoint?.cwd).toBe('/test/dir');
      expect(checkpoint?.messages).toHaveLength(1);
      expect(checkpoint?.timestamp).toBeDefined();
    });
  });

  describe('loadCheckpoint', () => {
    it('should load a saved checkpoint', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'World' },
      ];
      const id = saveCheckpoint(messages, 'gpt-4', 100);
      
      const loaded = loadCheckpoint(id);
      
      expect(loaded).not.toBeNull();
      expect(loaded?.messages).toHaveLength(2);
      expect(loaded?.messages[0].content).toBe('Hello');
    });

    it('should return null for non-existent checkpoint', () => {
      const loaded = loadCheckpoint('session-nonexistent');
      expect(loaded).toBeNull();
    });

    it('should return null for corrupted checkpoint', () => {
      // Create a corrupted file
      const badId = 'session-bad';
      const badPath = join(TEST_SESSIONS_DIR, `${badId}.json`);
      
      if (!existsSync(TEST_SESSIONS_DIR)) {
        mkdirSync(TEST_SESSIONS_DIR, { recursive: true });
      }
      
      // Write invalid JSON
      require('fs').writeFileSync(badPath, 'not valid json');
      
      const loaded = loadCheckpoint(badId);
      expect(loaded).toBeNull();
      
      // Clean up
      try { unlinkSync(badPath); } catch { }
    });
  });

  describe('listCheckpoints', () => {
    it('should return empty array when no checkpoints exist', () => {
      const list = listCheckpoints();
      expect(list).toEqual([]);
    });

    it('should return saved checkpoints sorted by date', () => {
      const messages: Message[] = [{ role: 'user', content: 'Test' }];
      
      // Save multiple checkpoints
      const id1 = saveCheckpoint(messages, 'gpt-4', 100);
      const id2 = saveCheckpoint(messages, 'gpt-4', 200);
      const id3 = saveCheckpoint(messages, 'gpt-4', 300);
      
      const list = listCheckpoints();
      
      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(id3); // Most recent first
      expect(list[2].id).toBe(id1); // Oldest last
    });

    it('should limit to 10 most recent checkpoints', () => {
      const messages: Message[] = [{ role: 'user', content: 'Test' }];
      
      // Save 15 checkpoints
      for (let i = 0; i < 15; i++) {
        saveCheckpoint(messages, 'gpt-4', i * 10);
      }
      
      const list = listCheckpoints();
      expect(list).toHaveLength(10);
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete an existing checkpoint', () => {
      const messages: Message[] = [{ role: 'user', content: 'Test' }];
      const id = saveCheckpoint(messages, 'gpt-4', 100);
      
      expect(existsSync(join(TEST_SESSIONS_DIR, `${id}.json`))).toBe(true);
      
      const deleted = deleteCheckpoint(id);
      
      expect(deleted).toBe(true);
      expect(existsSync(join(TEST_SESSIONS_DIR, `${id}.json`))).toBe(false);
    });

    it('should return false for non-existent checkpoint', () => {
      const deleted = deleteCheckpoint('session-nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('escape state', () => {
    it('should track escape pressed state', () => {
      expect(wasEscapePressed()).toBe(false);
      
      // Simulate escape press (would be done by handler)
      // We can't easily test the async handler without mocking stdin
      // But we can test the state reset
      
      resetEscapeState();
      expect(wasEscapePressed()).toBe(false);
      expect(getCurrentCheckpointId()).toBeNull();
    });
  });
});
