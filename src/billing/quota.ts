/**
 * billing/quota.ts — Quota enforcement with daily/monthly limits
 */
import type { QuotaStatus } from './types.js';
import { QUOTA_LIMITS } from './types.js';
import { getDailyUsage, getMonthlyUsage, incrementDailyUsage } from './db.js';
import { getToken } from '../utils/credentials.js';

const GATEWAY_URL = (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/$/, '');

/** In-memory remote quota cache — TTL 60s, offline-first */
interface RemoteQuotaCache {
  data: { allowed: boolean; remaining: number; tier: string } | null;
  fetchedAt: number;
}
let _remoteCache: RemoteQuotaCache = { data: null, fetchedAt: 0 };

/**
 * Check remote quota endpoint. Returns null on any error (offline-first).
 * Caches response for 60s to avoid hitting the API on every request.
 */
async function checkRemoteQuota(): Promise<{ allowed: boolean; remaining: number; tier: string } | null> {
  const now = Date.now();
  if (_remoteCache.data !== null && now - _remoteCache.fetchedAt < 60_000) {
    return _remoteCache.data;
  }
  const token = getToken();
  if (!token) return null; // BYOK — no remote quota
  try {
    const res = await fetch(`${GATEWAY_URL}/api/billing/quota`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { allowed?: boolean; remaining?: number; tier?: string };
    const data = {
      allowed: json.allowed !== false,
      remaining: typeof json.remaining === 'number' ? json.remaining : Infinity,
      tier: json.tier ?? 'free',
    };
    _remoteCache = { data, fetchedAt: now };
    return data;
  } catch {
    return null; // network error → offline-first, fall through to local
  }
}

export { checkRemoteQuota };

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function getUserId(): string {
  // CLI is single-user, use machine identifier
  return 'local-user';
}

export function checkQuota(tier: string = 'free'): QuotaStatus {
  const userId = getUserId();
  const limits = QUOTA_LIMITS[tier] ?? QUOTA_LIMITS.free;
  
  const today = getToday();
  const daily = getDailyUsage(userId, today);
  
  const month = getCurrentMonth();
  const monthly = getMonthlyUsage(userId, month);
  
  const exceeded = daily.tokens >= limits.daily || monthly >= limits.monthly;
  
  return {
    dailyTokens: daily.tokens,
    dailyLimit: limits.daily,
    monthlyTokens: monthly,
    monthlyLimit: limits.monthly,
    tier: tier as 'free' | 'pro' | 'team',
    exceeded,
  };
}

export function canMakeRequest(
  tokens: number,
  tier: string = 'free'
): { allowed: boolean; reason?: string } {
  const status = checkQuota(tier);
  
  if (status.exceeded) {
    return { allowed: false, reason: 'Quota exceeded. Upgrade at https://dirgha.ai/upgrade' };
  }
  
  const projectedDaily = status.dailyTokens + tokens;
  if (projectedDaily > status.dailyLimit) {
    return { allowed: false, reason: `Daily limit would exceed ${status.dailyLimit.toLocaleString()} tokens` };
  }
  
  const projectedMonthly = status.monthlyTokens + tokens;
  if (projectedMonthly > status.monthlyLimit) {
    return { allowed: false, reason: `Monthly limit would exceed ${status.monthlyLimit.toLocaleString()} tokens` };
  }
  
  return { allowed: true };
}

export function recordUsage(
  tokens: number,
  costUsd: number,
  tier: string = 'free'
): void {
  const userId = getUserId();
  const today = getToday();
  incrementDailyUsage(userId, today, tier, tokens, costUsd);
}

export function getQuotaSummary(tier = 'free'): string {
  const status = checkQuota(tier);
  const dailyPct = Math.round((status.dailyTokens / status.dailyLimit) * 100);
  const monthlyPct = Math.round((status.monthlyTokens / status.monthlyLimit) * 100);

  return [
    `Usage: ${status.dailyTokens.toLocaleString()}/${status.dailyLimit.toLocaleString()} daily (${dailyPct}%)`,
    `       ${status.monthlyTokens.toLocaleString()}/${status.monthlyLimit.toLocaleString()} monthly (${monthlyPct}%)`,
    `Tier: ${status.tier}`,
  ].join('\n');
}
