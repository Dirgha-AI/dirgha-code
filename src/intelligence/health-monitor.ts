/**
 * Provider health monitor.
 *
 * Tracks per-provider health stats across sessions.
 * Stored in ~/.dirgha/health.json.
 *
 * Blacklisting logic:
 *   - After 5 consecutive failures within 5 minutes, blacklist for 30 minutes.
 *   - After blacklist expires, allow one probe request.
 *   - After 10 probe failures, blacklist for 24 hours.
 *   - Recovery: after 3 consecutive successes, clear the blacklist.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ProviderHealth {
  provider: string;
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;
}

interface InternalState {
  provider: string;
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;
  consecutiveFailures: number;
  consecutiveFailuresWindowStart: number;
  probeCount: number;
  consecutiveSuccesses: number;
}

interface HealthStore {
  updatedAt: string;
  providers: Record<string, ProviderHealth>;
}

const HEALTH_PATH = join(homedir(), ".dirgha", "health.json");
const CONSECUTIVE_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const CONSECUTIVE_FAILURE_THRESHOLD = 5;
const INITIAL_BLACKLIST_MS = 30 * 60 * 1000;
const PROBE_BLACKLIST_THRESHOLD = 10;
const EXTENDED_BLACKLIST_MS = 24 * 60 * 60 * 1000;
const RECOVERY_SUCCESSES = 3;

const state = new Map<string, InternalState>();

function ensureState(provider: string): InternalState {
  let s = state.get(provider);
  if (!s) {
    s = {
      provider,
      totalRequests: 0,
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      avgLatencyMs: 0,
      blacklistedUntil: null,
      consecutiveFailures: 0,
      consecutiveFailuresWindowStart: 0,
      probeCount: 0,
      consecutiveSuccesses: 0,
    };
    state.set(provider, s);
  }
  return s;
}

function persist(): void {
  const dir = join(homedir(), ".dirgha");
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    return;
  }
  const store: HealthStore = {
    updatedAt: new Date().toISOString(),
    providers: {},
  };
  for (const [provider, s] of state) {
    store.providers[provider] = {
      provider: s.provider,
      totalRequests: s.totalRequests,
      failures: s.failures,
      lastFailure: s.lastFailure,
      lastSuccess: s.lastSuccess,
      avgLatencyMs: s.avgLatencyMs,
      blacklistedUntil: s.blacklistedUntil,
    };
  }
  try {
    writeFileSync(HEALTH_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch {
    // best-effort persistence
  }
}

function loadPersisted(): void {
  try {
    if (!existsSync(HEALTH_PATH)) return;
    const raw = readFileSync(HEALTH_PATH, "utf8");
    const store = JSON.parse(raw) as HealthStore;
    if (!store || typeof store !== "object" || !store.providers) return;
    const entries = Object.values(store.providers);
    for (const entry of entries) {
      if (!entry || typeof entry.provider !== "string") continue;
      const s = ensureState(entry.provider);
      s.totalRequests =
        typeof entry.totalRequests === "number" ? entry.totalRequests : 0;
      s.failures = typeof entry.failures === "number" ? entry.failures : 0;
      s.lastFailure =
        typeof entry.lastFailure === "number" ? entry.lastFailure : 0;
      s.lastSuccess =
        typeof entry.lastSuccess === "number" ? entry.lastSuccess : 0;
      s.avgLatencyMs =
        typeof entry.avgLatencyMs === "number" ? entry.avgLatencyMs : 0;
      s.blacklistedUntil =
        typeof entry.blacklistedUntil === "number"
          ? entry.blacklistedUntil
          : null;
    }
  } catch {
    // corrupted file — ignore
  }
}

loadPersisted();

export function recordSuccess(provider: string, latencyMs: number): void {
  const s = ensureState(provider);
  s.totalRequests++;
  s.lastSuccess = Date.now();
  s.avgLatencyMs =
    s.avgLatencyMs > 0
      ? (s.avgLatencyMs * (s.totalRequests - 1) + latencyMs) / s.totalRequests
      : latencyMs;
  s.consecutiveFailures = 0;
  s.consecutiveFailuresWindowStart = 0;

  if (s.blacklistedUntil !== null && isProbeActive(s)) {
    s.probeCount = 0;
  }

  s.consecutiveSuccesses++;
  if (
    s.consecutiveSuccesses >= RECOVERY_SUCCESSES &&
    s.blacklistedUntil !== null
  ) {
    s.blacklistedUntil = null;
    s.probeCount = 0;
    s.consecutiveSuccesses = 0;
  }

  persist();
}

export function recordFailure(provider: string, _error: string): void {
  const now = Date.now();
  const s = ensureState(provider);
  s.totalRequests++;
  s.failures++;
  s.lastFailure = now;
  s.consecutiveSuccesses = 0;

  if (s.blacklistedUntil !== null && isProbeActive(s)) {
    s.probeCount++;
    if (s.probeCount >= PROBE_BLACKLIST_THRESHOLD) {
      s.blacklistedUntil = now + EXTENDED_BLACKLIST_MS;
      s.probeCount = 0;
    }
    persist();
    return;
  }

  if (now - s.consecutiveFailuresWindowStart > CONSECUTIVE_FAILURE_WINDOW_MS) {
    s.consecutiveFailures = 0;
    s.consecutiveFailuresWindowStart = now;
  }
  s.consecutiveFailures++;
  if (s.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    s.blacklistedUntil = now + INITIAL_BLACKLIST_MS;
    s.consecutiveFailures = 0;
    s.consecutiveFailuresWindowStart = 0;
    s.probeCount = 0;
  }

  persist();
}

export function isBlacklisted(provider: string): boolean {
  const s = state.get(provider);
  if (!s || s.blacklistedUntil === null) return false;
  if (s.blacklistedUntil === 0) return true;
  if (Date.now() < s.blacklistedUntil) return true;
  if (isProbeActive(s)) {
    return false;
  }
  s.blacklistedUntil = null;
  s.probeCount = 0;
  return false;
}

function isProbeActive(s: InternalState): boolean {
  if (s.blacklistedUntil === null) return false;
  if (s.blacklistedUntil === 0) return false;
  return Date.now() >= s.blacklistedUntil;
}

export function getHealth(provider: string): ProviderHealth | null {
  const s = state.get(provider);
  if (!s) return null;
  return {
    provider: s.provider,
    totalRequests: s.totalRequests,
    failures: s.failures,
    lastFailure: s.lastFailure,
    lastSuccess: s.lastSuccess,
    avgLatencyMs: s.avgLatencyMs,
    blacklistedUntil: s.blacklistedUntil,
  };
}

export function getAllHealth(): ProviderHealth[] {
  return Array.from(state.values()).map((s) => ({
    provider: s.provider,
    totalRequests: s.totalRequests,
    failures: s.failures,
    lastFailure: s.lastFailure,
    lastSuccess: s.lastSuccess,
    avgLatencyMs: s.avgLatencyMs,
    blacklistedUntil: s.blacklistedUntil,
  }));
}

export function resetHealth(provider: string): void {
  state.delete(provider);
  persist();
}
