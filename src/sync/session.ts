import crypto from 'node:crypto';
import type { Message } from '../types.js';
import { getToken, readCredentials } from '../utils/credentials.js';
import { readProfile, refreshProfileIfStale } from '../utils/profile.js';

export interface CloudSession {
  id: string;
  model: string;
  tokensUsed: number;
  title: string;
  createdAt: string;
  messages?: Message[];
}

/**
 * Fetch up to `limit` recent sessions from the cloud (cross-device resume).
 * Returns [] on any error — offline-first.
 */
export async function fetchCloudSessions(limit = 5): Promise<CloudSession[]> {
  const token = getToken();
  if (!token) return [];
  const gatewayUrl = (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/$/, '');
  try {
    const res = await fetch(`${gatewayUrl}/api/cli/sessions?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { sessions?: CloudSession[] };
    return Array.isArray(json.sessions) ? json.sessions : [];
  } catch {
    return [];
  }
}

export interface SessionPayload {
  session_id: string;
  model: string;
  tokens: number;
  source: 'dirgha-code';
  messages: Message[];
  created_at: string;
}

export function buildSessionPayload(
  messages: Message[],
  model: string,
  tokens: number,
): SessionPayload {
  return {
    session_id: crypto.randomUUID(),
    model,
    tokens,
    source: 'dirgha-code',
    messages,
    created_at: new Date().toISOString(),
  };
}

export async function syncSession(
  messages: Message[],
  model: string,
  tokens: number,
  costUsd?: number,
): Promise<void> {
  const gatewayUrl = (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/$/, '');
  const token = getToken();
  if (!token) return;

  const creds = readCredentials();
  const payload = {
    ...buildSessionPayload(messages, model, tokens),
    user_id: creds?.userId,
    cost_usd: costUsd ?? 0,
  };

  // Fire both requests concurrently, silent-fail both
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const opts = { method: 'POST', headers, signal: AbortSignal.timeout(5000) };

  await Promise.allSettled([
    // Session history sync
    fetch(`${gatewayUrl}/api/cli/sessions`, { ...opts, body: JSON.stringify(payload) }),
    // Usage/billing sync (deduct credits on server)
    tokens > 0 ? fetch(`${gatewayUrl}/api/billing/usage`, {
      ...opts,
      body: JSON.stringify({
        user_id: creds?.userId,
        model,
        tokens_used: tokens,
        cost_usd: costUsd ?? 0,
        source: 'dirgha-code',
        session_id: payload.session_id,
      }),
    }) : Promise.resolve(),
    // Refresh profile if stale (picks up plan changes, credit top-ups)
    refreshProfileIfStale(token),
  ]);
}
