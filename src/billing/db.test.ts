/**
 * billing/db.test.ts — Billing database tests
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  saveUsageRecord,
  saveToolUsage,
  getDailyUsage,
  incrementDailyUsage,
  getMonthlyUsage,
  migrateBillingTables,
} from './db.js';
import type { UsageRecord, ToolUsageRecord } from './types.js';

describe('BillingDb', () => {
  const testUserId = 'test-user-' + Date.now();
  const testSessionId = 'session-' + Date.now();
  
  beforeAll(() => {
    migrateBillingTables();
  });

  it('saves usage records', () => {
    const record: UsageRecord = {
      id: crypto.randomUUID(),
      sessionId: testSessionId,
      model: 'gpt-4',
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      toolCalls: 2,
      costUsd: 0.015,
      createdAt: new Date().toISOString(),
    };
    
    expect(() => saveUsageRecord(record)).not.toThrow();
  });

  it('saves tool usage records', () => {
    const record: ToolUsageRecord = {
      id: crypto.randomUUID(),
      sessionId: testSessionId,
      toolName: 'read_file',
      args: { path: '/test/path' },
      result: 'success',
      durationMs: 500,
      createdAt: new Date().toISOString(),
    };
    
    expect(() => saveToolUsage(record)).not.toThrow();
  });

  it('increments and retrieves daily usage', () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Increment usage
    incrementDailyUsage(testUserId, today, 'free', 1000, 0.02);
    
    // Retrieve usage
    const usage = getDailyUsage(testUserId, today);
    expect(usage.tokens).toBeGreaterThanOrEqual(1000);
    expect(usage.costUsd).toBeGreaterThanOrEqual(0.02);
    expect(usage.requests).toBeGreaterThanOrEqual(1);
  });

  it('retrieves monthly usage', () => {
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const total = getMonthlyUsage(testUserId, yearMonth);
    expect(typeof total).toBe('number');
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it('handles non-existent daily usage gracefully', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const usage = getDailyUsage('non-existent-user', yesterday);
    
    expect(usage.tokens).toBe(0);
    expect(usage.costUsd).toBe(0);
    expect(usage.requests).toBe(0);
  });
});
