/**
 * billing/types.ts — Billing types and interfaces
 */
import type { Message, ContentBlock } from '../types.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  remainingRequests: number;
  resetAt: Date;
  windowMs: number;
}

export interface QuotaStatus {
  dailyTokens: number;
  dailyLimit: number;
  monthlyTokens: number;
  monthlyLimit: number;
  tier: 'free' | 'pro' | 'team';
  exceeded: boolean;
}

export interface UsageRecord {
  id: string;
  sessionId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  costUsd: number;
  createdAt: string;
}

export interface ToolUsageRecord {
  id: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  createdAt: string;
}

export interface ModelPricing {
  model: string;
  provider: string;
  inputPricePer1k: number;  // USD per 1K tokens
  outputPricePer1k: number; // USD per 1K tokens
}

export const QUOTA_LIMITS: Record<string, { daily: number; monthly: number }> = {
  free: { daily: 0, monthly: 0 },
  pro: { daily: 500_000, monthly: 10_000_000 },
  team: { daily: 2_000_000, monthly: 100_000_000 },
};

export const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  free: { requests: 30, windowMs: 60_000 },      // 30/min
  pro: { requests: 120, windowMs: 60_000 },     // 120/min
  team: { requests: 600, windowMs: 60_000 },    // 600/min
};
