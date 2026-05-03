/**
 * Provider health monitor — smart exponential-backoff cooldown.
 *
 * Tracks per-provider health across sessions. Stored in ~/.dirgha/health.json.
 *
 * Design principles:
 *   1. Don't punish transient blips. A few failures in a window → short cooldown.
 *   2. Escalate only for persistent failures. Cooldown grows exponentially.
 *   3. Success decays the failure window aggressively. 2 successes = fresh start.
 *   4. Cooldown level decays over 24h of good behavior.
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
  cooldownLevel: number;
}

interface InternalState {
  provider: string;
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;
  cooldownLevel: number;
  failureWindowStart: number;
  failuresInWindow: number;
  probeActive: boolean;
  consecutiveSuccesses: number;
  lastCooldownDecay: number;
}

const HEALTH_PATH = join(homedir(), ".dirgha", "health.json");

// Rolling window for counting failures before triggering cooldown.
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

// How many failures in a single window before the first cooldown triggers.
const FAILURE_TRIGGER = 5;

// Exponential backoff levels (cumulative, 0-indexed).
const COOLDOWN_BACKOFF_MS = [
  30_000, // Level 1: 30 seconds (transient blip)
  120_000, // Level 2: 2 minutes
  300_000, // Level 3: 5 minutes
  900_000, // Level 4: 15 minutes
  1_800_000, // Level 5: 30 minutes
  3_600_000, // Level 6: 1 hour
  21_600_000, // Level 7: 6 hours
  86_400_000, // Level 8: 24 hours
];

// Number of probe attempts before escalating to the next cooldown level.
const MAX_PROBES_BEFORE_ESCALATE = 3;

// Consecutive successes required to reset the cooldown entirely.
const RECOVERY_SUCCESSES = 2;

// If a provider has been stable for this long, decay cooldown by 1 level.
const COOLDOWN_DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
      cooldownLevel: 0,
      failureWindowStart: 0,
      failuresInWindow: 0,
      probeActive: false,
      consecutiveSuccesses: 0,
      lastCooldownDecay: Date.now(),
    };
    state.set(provider, s);
  }
  return s;
}

function getCooldownMs(level: number): number {
  const idx = Math.min(level, COOLDOWN_BACKOFF_MS.length - 1);
  return COOLDOWN_BACKOFF_MS[idx];
}

function persist(): void {
  const dir = join(homedir(), ".dirgha");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const store: {
    updatedAt: string;
    providers: Record<string, Record<string, unknown>>;
  } = {
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
      cooldownLevel: s.cooldownLevel,
    };
  }
  try {
    writeFileSync(HEALTH_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch {
    /* best-effort */
  }
}

function loadPersisted(): void {
  try {
    if (!existsSync(HEALTH_PATH)) return;
    const raw = readFileSync(HEALTH_PATH, "utf8");
    const store = JSON.parse(raw) as {
      providers?: Record<string, Record<string, unknown>>;
    };
    if (!store?.providers) return;
    for (const [provider, entry] of Object.entries(store.providers)) {
      if (!entry || typeof entry.provider !== "string") continue;
      const s = ensureState(entry.provider);
      s.totalRequests = (entry.totalRequests as number) ?? 0;
      s.failures = (entry.failures as number) ?? 0;
      s.lastFailure = (entry.lastFailure as number) ?? 0;
      s.lastSuccess = (entry.lastSuccess as number) ?? 0;
      s.avgLatencyMs = (entry.avgLatencyMs as number) ?? 0;
      s.blacklistedUntil = (entry.blacklistedUntil as number) ?? null;
      s.cooldownLevel = (entry.cooldownLevel as number) ?? 0;
      // Restore internal counters — default to clean state
      s.failuresInWindow = 0;
      s.failureWindowStart = 0;
      s.probeActive = false;
      s.consecutiveSuccesses = 0;
      s.lastCooldownDecay = Date.now();
    }
  } catch {
    /* corrupted file — ignore */
  }
}

loadPersisted();

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export function recordSuccess(provider: string, latencyMs: number): void {
  const s = ensureState(provider);
  s.totalRequests++;
  s.lastSuccess = Date.now();
  s.avgLatencyMs =
    s.avgLatencyMs > 0
      ? (s.avgLatencyMs * (s.totalRequests - 1) + latencyMs) / s.totalRequests
      : latencyMs;

  // Reset the failure window on any success.
  s.failuresInWindow = 0;
  s.failureWindowStart = 0;
  s.probeActive = false;

  // Decay cooldown on prolonged good behavior.
  if (
    s.cooldownLevel > 0 &&
    s.blacklistedUntil === null &&
    s.lastSuccess - s.lastCooldownDecay > COOLDOWN_DECAY_INTERVAL_MS
  ) {
    s.cooldownLevel = Math.max(0, s.cooldownLevel - 1);
    s.lastCooldownDecay = s.lastSuccess;
  }

  // If we're in an active cooldown, this was a probe request.
  // A successful probe immediately ends the cooldown.
  if (isBlacklisted(provider)) {
    s.blacklistedUntil = null;
    s.cooldownLevel = Math.max(0, s.cooldownLevel - 1);
    s.consecutiveSuccesses = 0;
    persist();
    return;
  }

  s.consecutiveSuccesses++;
  if (s.consecutiveSuccesses >= RECOVERY_SUCCESSES) {
    // Two consecutive successes — aggressive recovery.
    s.blacklistedUntil = null;
    s.cooldownLevel = Math.max(0, s.cooldownLevel - 1);
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

  // If we're in an active cooldown and this was a probe, escalate.
  if (isBlacklisted(provider) && s.probeActive) {
    s.cooldownLevel = Math.min(
      s.cooldownLevel + 1,
      COOLDOWN_BACKOFF_MS.length - 1,
    );
    s.blacklistedUntil = now + getCooldownMs(s.cooldownLevel);
    s.probeActive = false;
    persist();
    return;
  }

  // Rolling window: count failures within FAILURE_WINDOW_MS.
  if (now - s.failureWindowStart > FAILURE_WINDOW_MS) {
    s.failureWindowStart = now;
    s.failuresInWindow = 0;
  }
  s.failuresInWindow++;

  // Trigger cooldown only after failure spike.
  if (s.failuresInWindow >= FAILURE_TRIGGER) {
    s.cooldownLevel = Math.min(
      s.cooldownLevel + 1,
      COOLDOWN_BACKOFF_MS.length - 1,
    );
    s.blacklistedUntil = now + getCooldownMs(s.cooldownLevel);
    s.failuresInWindow = 0;
    s.failureWindowStart = 0;
    s.probeActive = true; // first request after cooldown expires is a probe
  }

  persist();
}

export function isBlacklisted(provider: string): boolean {
  const s = state.get(provider);
  if (!s) return false;
  if (s.blacklistedUntil === null) return false;
  if (Date.now() < s.blacklistedUntil) return true;
  // Cooldown expired — allow a probe.
  s.probeActive = true;
  return false;
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
    cooldownLevel: s.cooldownLevel,
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
    cooldownLevel: s.cooldownLevel,
  }));
}

export function resetHealth(provider: string): void {
  state.delete(provider);
  persist();
}
