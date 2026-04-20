/**
 * utils/id.ts — Unique ID generation utilities
 */
import { randomBytes, randomUUID } from 'crypto';

let lastTimestamp = 0;
let counter = 0;

/**
 * Generates a session ID that is unique even if called within the same millisecond.
 * Includes worker ID (PM2) or process PID to prevent cross-process collisions.
 * Format: <timestamp>_<counter>[_w<workerId> | _p<pid>]
 */
export function generateSessionId(): string {
  const now = Date.now();
  if (now === lastTimestamp) {
    counter++;
  } else {
    lastTimestamp = now;
    counter = 0;
  }

  const paddedCounter = counter.toString().padStart(4, '0');
  const workerId = process.env.NODE_APP_INSTANCE;
  const suffix = workerId !== undefined ? `w${workerId}` : `p${process.pid}`;

  return `${now}_${paddedCounter}_${suffix}`;
}

interface UniqueIdOptions {
  entropyBytes?: number;
  useUuid?: boolean;
}

/**
 * Generates a unique ID with optional entropy or UUID.
 */
export function generateUniqueId(options: UniqueIdOptions = {}): string {
  if (options.useUuid) {
    return randomUUID();
  }
  const bytes = options.entropyBytes ?? 16;
  return randomBytes(bytes).toString('hex');
}

/**
 * Checks if a session ID is unique (placeholder for more complex logic if needed)
 */
export function isSessionIdUnique(id: string): boolean {
  return !!id;
}
