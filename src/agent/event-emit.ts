/**
 * agent/event-emit.ts — Ship CLI agent events to the gateway so web clients
 * can live-tail the session via GET /api/cli/sessions/:id/stream.
 *
 * Fire-and-forget. Never blocks the agent loop. Never throws. Batches events
 * into a single POST per 250ms so a fast tool_use burst doesn't DDOS the
 * gateway. If the gateway is unreachable, events are dropped silently — this
 * is an observability feature, not a durability guarantee.
 */
import { getToken } from '../utils/credentials.js';

type EventType =
  | 'thinking'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'diff'
  | 'terminal'
  | 'file_write'
  | 'error'
  | 'done';

interface PendingEvent {
  type: EventType;
  data: unknown;
}

const queue: PendingEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let activeSessionId: string | null = null;

// Circuit breaker: if the gateway is consistently failing (5xx/401/network),
// stop hammering it. Prior code fired a POST on every flush regardless of
// outcome; under a gateway outage that became N concurrent CLIs × keystrokes/s
// pointed at the same endpoint. Now we back off and eventually open the
// breaker so the CLI stops retrying until it's obviously healthy again.
const MAX_QUEUE = 1000;            // hard cap to stop memory blow-up under outage
const OPEN_BREAKER_AFTER = 5;      // consecutive failures → open
const BREAKER_COOLDOWN_MS = 30_000; // open for 30s, then try one
let consecutiveFailures = 0;
let breakerOpenUntil = 0;
let nextBackoffMs = 250;           // starts at the normal batch interval

const gatewayUrl = () =>
  (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/$/, '');

export function setActiveSession(sessionId: string | null): void {
  activeSessionId = sessionId;
}

export function emitAgentEvent(type: EventType, data: unknown): void {
  if (!activeSessionId) return;
  if (Date.now() < breakerOpenUntil) return;   // breaker open: silently drop
  queue.push({ type, data });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (!flushTimer) flushTimer = setTimeout(flush, nextBackoffMs);
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0 || !activeSessionId) return;
  if (Date.now() < breakerOpenUntil) { queue.length = 0; return; }
  const token = getToken();
  if (!token) { queue.length = 0; return; }

  const batch = queue.splice(0, queue.length);
  const sessionId = activeSessionId;
  try {
    const r = await fetch(`${gatewayUrl()}/api/cli/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      consecutiveFailures = 0;
      nextBackoffMs = 250;
    } else {
      recordFailure();
    }
  } catch {
    recordFailure();
  }
}

function recordFailure(): void {
  consecutiveFailures++;
  // Exponential backoff capped at 30s.
  nextBackoffMs = Math.min(nextBackoffMs * 2, 30_000);
  if (consecutiveFailures >= OPEN_BREAKER_AFTER) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    // Drop any queued events so we don't re-flood when the breaker closes.
    queue.length = 0;
    // Reset the failure count for the next probe.
    consecutiveFailures = 0;
  }
}

/** Call at session end to drain any pending events and emit a done marker. */
export async function finalizeAgentEvents(): Promise<void> {
  if (!activeSessionId) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  queue.push({ type: 'done', data: { at: new Date().toISOString() } });
  await flush();
  activeSessionId = null;
}
