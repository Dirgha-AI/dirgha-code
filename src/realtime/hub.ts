/**
 * Realtime Hub — WebSocket-based realtime updates
 * Supports: scoped subscriptions, event deduplication, reconnection
 */
import type { WebSocket } from "ws";
import { EventEmitter } from "node:events";

export type RealtimeEvent = {
  id: string;
  type: string;
  scope: string; // e.g., 'workspace:123', 'task:456', 'agent:789'
  payload: any;
  timestamp: number;
  senderId?: string; // To prevent echo
};

export type ScopePattern = string; // e.g., 'workspace:*', 'task:123'

export interface RealtimeHub {
  // Subscribe to events matching scope
  subscribe(clientId: string, ws: WebSocket, scopes: ScopePattern[]): void;

  // Unsubscribe a client
  unsubscribe(clientId: string): void;

  // Publish event to all matching subscribers
  publish(event: RealtimeEvent): void;

  // Get active subscribers count
  getSubscriberCount(scope?: string): number;
}

interface Subscriber {
  clientId: string;
  ws: WebSocket;
  scopes: ScopePattern[];
  seenEvents: Set<string>; // Deduplication set for replayed events
}

// In-memory implementation (swap for Redis for multi-instance deployments)
const subscribers = new Map<string, Subscriber>();
const recentEvents = new Map<string, number>(); // eventId -> timestamp for dedup
const EVENT_TTL = 60_000; // 60 seconds

function matchesScope(eventScope: string, patterns: ScopePattern[]): boolean {
  return patterns.some((p) => {
    if (p.endsWith("*")) {
      const prefix = p.slice(0, -1); // e.g., 'workspace:' from 'workspace:*'
      return eventScope.startsWith(prefix);
    }
    return p === eventScope;
  });
}

function cleanOldEvents(): void {
  const now = Date.now();
  const entries = Array.from(recentEvents.entries());
  for (const [id, ts] of entries) {
    if (now - ts > EVENT_TTL) {
      recentEvents.delete(id);
    }
  }
}

export const InMemoryRealtimeHub: RealtimeHub = {
  subscribe(clientId, ws, scopes) {
    // Clean old events periodically
    cleanOldEvents();

    const existing = subscribers.get(clientId);
    if (existing) {
      // Update scopes
      existing.scopes = scopes;
      existing.ws = ws; // Update websocket (reconnection)
      return;
    }

    const subscriber: Subscriber = {
      clientId,
      ws,
      scopes,
      seenEvents: new Set(),
    };

    subscribers.set(clientId, subscriber);

    // Send initial state or confirmation
    try {
      ws.send(
        JSON.stringify({ type: "subscribed", scopes, timestamp: Date.now() }),
      );
    } catch {
      /* ignore */
    }

    // Handle disconnect
    ws.once("close", () => {
      // Delay removal to allow reconnection
      setTimeout(() => {
        const s = subscribers.get(clientId);
        if (s && s.ws === ws) {
          subscribers.delete(clientId);
        }
      }, 5000); // 5s grace period
    });

    ws.once("error", () => {
      subscribers.delete(clientId);
    });
  },

  unsubscribe(clientId) {
    subscribers.delete(clientId);
  },

  publish(event) {
    // Deduplicate: store event ID with timestamp
    recentEvents.set(event.id, event.timestamp);
    cleanOldEvents();

    const eventScope = event.scope;
    const eventStr = JSON.stringify(event);

    const subs = Array.from(subscribers.entries());
    for (const [clientId, sub] of subs) {
      // Skip if client sent this event (prevent echo)
      if (sub.clientId === event.senderId) continue;

      // Check if client is interested in this scope
      if (!matchesScope(eventScope, sub.scopes)) continue;

      // Check deduplication
      if (sub.seenEvents.has(event.id)) continue;
      sub.seenEvents.add(event.id);

      // Limit seen events size (prevent memory leak)
      if (sub.seenEvents.size > 1000) {
        const iterator = sub.seenEvents.values();
        for (let i = 0; i < 500; i++) {
          const { value } = iterator.next();
          if (value) sub.seenEvents.delete(value);
        }
      }

      try {
        sub.ws.send(eventStr);
      } catch {
        // Failed to send, remove subscriber
        subscribers.delete(clientId);
      }
    }
  },

  getSubscriberCount(scope?) {
    if (!scope) return subscribers.size;
    let count = 0;
    const subs = Array.from(subscribers.values());
    for (const sub of subs) {
      if (matchesScope(scope, sub.scopes)) count++;
    }
    return count;
  },
};

/**
 * Create scoped event (helper)
 * Scoped events drive workspace/agent/task updates.
 */
export function createEvent(
  type: string,
  scope: string,
  payload: any,
  senderId?: string,
): RealtimeEvent {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    scope,
    payload,
    timestamp: Date.now(),
    senderId,
  };
}

/**
 * Common event types
 */
export const EventType = {
  // Task events
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_STEP: "task.step", // Progress update
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",

  // Agent events
  AGENT_STATUS: "agent.status",
  AGENT_HEARTBEAT: "agent.heartbeat",

  // Workspace events
  WORKSPACE_UPDATED: "workspace.updated",
  WORKSPACE_MEMBER: "workspace.member",

  // System events
  SYSTEM_NOTIFICATION: "system.notification",
  SYSTEM_ERROR: "system.error",
} as const;
