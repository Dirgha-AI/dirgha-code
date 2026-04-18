/**
 * billing/quota.test.ts — Quota and remote quota tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkQuota, canMakeRequest } from './quota.js';

// Mock DB layer
vi.mock('./db.js', () => ({
  getDailyUsage: vi.fn().mockReturnValue({ tokens: 0, costUsd: 0, requests: 0 }),
  getMonthlyUsage: vi.fn().mockReturnValue(0),
  incrementDailyUsage: vi.fn(),
  saveUsageRecord: vi.fn(),
}));

import { getDailyUsage, getMonthlyUsage } from './db.js';

describe('checkQuota', () => {
  beforeEach(() => {
    vi.mocked(getDailyUsage).mockReturnValue({ tokens: 0, costUsd: 0, requests: 0 });
    vi.mocked(getMonthlyUsage).mockReturnValue(0);
  });

  it('returns correct structure for free tier', () => {
    const s = checkQuota('free');
    expect(s.tier).toBe('free');
    expect(s.dailyLimit).toBe(100_000);
    expect(s.monthlyLimit).toBe(1_000_000);
    expect(s.exceeded).toBe(false);
  });

  it('reports exceeded when daily tokens at limit', () => {
    vi.mocked(getDailyUsage).mockReturnValue({ tokens: 100_000, costUsd: 0, requests: 0 });
    const s = checkQuota('free');
    expect(s.exceeded).toBe(true);
  });

  it('reports exceeded when monthly tokens at limit', () => {
    vi.mocked(getMonthlyUsage).mockReturnValue(1_000_000);
    const s = checkQuota('free');
    expect(s.exceeded).toBe(true);
  });

  it('pro tier has higher limits', () => {
    const s = checkQuota('pro');
    expect(s.dailyLimit).toBe(500_000);
    expect(s.monthlyLimit).toBe(10_000_000);
  });
});

describe('canMakeRequest', () => {
  beforeEach(() => {
    vi.mocked(getDailyUsage).mockReturnValue({ tokens: 0, costUsd: 0, requests: 0 });
    vi.mocked(getMonthlyUsage).mockReturnValue(0);
  });

  it('allows request when under quota', () => {
    const r = canMakeRequest(1000, 'free');
    expect(r.allowed).toBe(true);
  });

  it('blocks request when daily limit would be exceeded', () => {
    vi.mocked(getDailyUsage).mockReturnValue({ tokens: 99_500, costUsd: 0, requests: 0 });
    const r = canMakeRequest(1000, 'free');
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('Daily');
  });

  it('blocks request when monthly limit would be exceeded', () => {
    vi.mocked(getMonthlyUsage).mockReturnValue(999_500);
    const r = canMakeRequest(1000, 'free');
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('Monthly');
  });
});
