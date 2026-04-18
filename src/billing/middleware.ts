/**
 * billing/middleware.ts — Billing middleware for agent loop
 */
import type { Message, ModelResponse } from '../types.js';
import { checkQuota, canMakeRequest, recordUsage, getQuotaSummary, checkRemoteQuota } from './quota.js';
import { getActiveProvider } from '../providers/index.js';
import { checkRateLimit, recordRequest } from './ratelimit.js';
import { extractTokenUsage } from './meter.js';
import { calculateCost } from './pricing.js';
import { saveUsageRecord } from './db.js';
import type { TokenUsage } from './types.js';
import { readCredentials } from '../utils/credentials.js';
import { readProfile } from '../utils/profile.js';

export interface BillingContext {
  userId: string;
  tier: string;
  sessionId: string;
}

export function createBillingContext(sessionId: string): BillingContext {
  const creds = readCredentials();
  const profile = readProfile();
  return {
    userId:   creds?.userId || 'local-user',
    tier:     profile?.tier || 'free',
    sessionId,
  };
}

export async function preRequestCheck(
  billing: BillingContext,
  estimatedTokens: number
): Promise<{ allowed: boolean; reason?: string; quotaSummary?: string }> {
  // Rate limit check
  const rateStatus = checkRateLimit(billing.userId, billing.tier);
  if (!rateStatus.allowed) {
    return {
      allowed: false,
      reason: `Rate limit exceeded. Try again at ${rateStatus.resetAt.toLocaleTimeString()}`,
    };
  }

  // Skip quota checks when using a BYOK provider key — the user pays the
  // provider directly and these limits are only meaningful for the hosted gateway.
  const isByok = getActiveProvider() !== 'gateway';

  if (!isByok) {
    // Local quota check
    const quotaCheck = canMakeRequest(estimatedTokens, billing.tier);
    if (!quotaCheck.allowed) {
      return {
        allowed: false,
        reason: quotaCheck.reason,
        quotaSummary: getQuotaSummary(billing.tier),
      };
    }

    // Remote quota check (offline-first — ignores errors)
    const remote = await checkRemoteQuota();
    if (remote !== null && !remote.allowed) {
      return {
        allowed: false,
        reason: `Remote quota exceeded. Upgrade at https://dirgha.ai/upgrade`,
        quotaSummary: getQuotaSummary(billing.tier),
      };
    }
  }

  return { allowed: true };
}

export function recordApiUsage(
  billing: BillingContext,
  model: string,
  messages: Message[],
  response: ModelResponse
): TokenUsage & { costUsd: number } {
  const usage = extractTokenUsage(messages, response.content, response.usage);
  const costUsd = calculateCost(usage.inputTokens, usage.outputTokens, model);

  // Record in-memory rate limit
  recordRequest(billing.userId, billing.tier);

  // Record quota usage
  recordUsage(usage.totalTokens, costUsd, billing.tier);

  // Persist detailed record
  saveUsageRecord({
    id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: billing.sessionId,
    model,
    provider: model.split('/')[0] ?? 'unknown',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    toolCalls: usage.toolCalls,
    costUsd,
    createdAt: new Date().toISOString(),
  });

  return { ...usage, costUsd };
}

export function getBillingSummary(billing: BillingContext): string {
  const quota = checkQuota(billing.tier);
  const rate = checkRateLimit(billing.userId, billing.tier);

  return [
    `Session: ${billing.sessionId.slice(0, 8)}...`,
    `Tier: ${billing.tier}`,
    `Daily: ${quota.dailyTokens.toLocaleString()}/${quota.dailyLimit.toLocaleString()}`,
    `Monthly: ${quota.monthlyTokens.toLocaleString()}/${quota.monthlyLimit.toLocaleString()}`,
    `Rate: ${rate.remainingRequests} remaining`,
  ].join(' | ');
}
