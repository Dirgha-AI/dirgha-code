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
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// ──────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────
const HEALTH_PATH = join(homedir(), ".dirgha", "health.json");
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_TRIGGER = 5; // failures within window to trigger cooldown
const COOLDOWN_BACKOFF_MS = [
    30_000, // Level 0: 30 seconds
    120_000, // Level 1: 2 minutes
    300_000, // Level 2: 5 minutes
    900_000, // Level 3: 15 minutes
    1_800_000, // Level 4: 30 minutes
    3_600_000, // Level 5: 1 hour
    21_600_000, // Level 6: 6 hours
    86_400_000, // Level 7: 24 hours
];
const RECOVERY_SUCCESSES = 2; // consecutive successes to decrement cooldown level
const COOLDOWN_DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h of good behaviour → auto-decrement
const MAX_FAILOVERS = 3; // consecutive failovers before failover-blacklist
const FAILOVER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes – failover events outside this window decay
// ──────────────────────────────────────────────────────────
// Internal state
// ──────────────────────────────────────────────────────────
const state = new Map();
function toKey(provider, model) {
    return `${provider}:${model}`;
}
function getCooldownMs(level) {
    const idx = Math.min(level, COOLDOWN_BACKOFF_MS.length - 1);
    return COOLDOWN_BACKOFF_MS[idx];
}
function ensureState(provider, model) {
    const key = toKey(provider, model);
    let s = state.get(key);
    if (!s) {
        s = {
            provider,
            model,
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
            failoverBlacklisted: false,
            failoverCount: 0,
        };
        state.set(key, s);
    }
    return s;
}
// ──────────────────────────────────────────────────────────
// Persistence — atomic write with EXDEV fallback
// ──────────────────────────────────────────────────────────
function stateToObject() {
    const obj = {};
    for (const [key, s] of state) {
        obj[key] = {
            provider: s.provider,
            model: s.model,
            totalRequests: s.totalRequests,
            failures: s.failures,
            lastFailure: s.lastFailure,
            lastSuccess: s.lastSuccess,
            avgLatencyMs: s.avgLatencyMs,
            blacklistedUntil: s.blacklistedUntil,
            cooldownLevel: s.cooldownLevel,
            failureWindowStart: s.failureWindowStart,
            failuresInWindow: s.failuresInWindow,
            probeActive: s.probeActive,
            consecutiveSuccesses: s.consecutiveSuccesses,
            lastCooldownDecay: s.lastCooldownDecay,
            failoverBlacklisted: s.failoverBlacklisted,
            failoverCount: s.failoverCount,
        };
    }
    return obj;
}
function persist() {
    const dir = join(homedir(), ".dirgha");
    try {
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
    }
    catch {
        return;
    }
    const store = {
        updatedAt: new Date().toISOString(),
        entries: stateToObject(),
    };
    const tmpPath = HEALTH_PATH + '.tmp';
    try {
        writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
        renameSync(tmpPath, HEALTH_PATH);
    }
    catch (err) {
        // EXDEV: cross-device link, fall back to direct write
        if (err.code === 'EXDEV') {
            console.warn('[health-monitor] cross-device atomic write fallback');
            try {
                writeFileSync(HEALTH_PATH, JSON.stringify(store, null, 2), 'utf8');
                try {
                    unlinkSync(tmpPath);
                }
                catch { /* ignore */ }
            }
            catch (fallbackErr) {
                console.warn('[health-monitor] fallback persist also failed:', fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
            }
        }
        else {
            console.warn('[health-monitor] failed to persist health.json:', err instanceof Error ? err.message : String(err));
        }
    }
}
function loadPersisted() {
    // Clean up stale .tmp file from previous interrupted atomic write
    try {
        const tmpPath = HEALTH_PATH + '.tmp';
        if (existsSync(tmpPath))
            unlinkSync(tmpPath);
    }
    catch { /* ignore */ }
    try {
        if (!existsSync(HEALTH_PATH))
            return;
        const raw = readFileSync(HEALTH_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.entries) {
            for (const [_key, entry] of Object.entries(parsed.entries)) {
                if (!entry || typeof entry.provider !== 'string' || typeof entry.model !== 'string')
                    continue;
                const prov = entry.provider;
                const model = entry.model;
                const s = ensureState(prov, model);
                s.totalRequests = typeof entry.totalRequests === 'number' ? entry.totalRequests : 0;
                s.failures = typeof entry.failures === 'number' ? entry.failures : 0;
                s.lastFailure = typeof entry.lastFailure === 'number' ? entry.lastFailure : 0;
                s.lastSuccess = typeof entry.lastSuccess === 'number' ? entry.lastSuccess : 0;
                s.avgLatencyMs = typeof entry.avgLatencyMs === 'number' ? entry.avgLatencyMs : 0;
                s.blacklistedUntil = typeof entry.blacklistedUntil === 'number' ? entry.blacklistedUntil : null;
                s.cooldownLevel = typeof entry.cooldownLevel === 'number' ? entry.cooldownLevel : 0;
                s.failureWindowStart = typeof entry.failureWindowStart === 'number' ? entry.failureWindowStart : 0;
                s.failuresInWindow = typeof entry.failuresInWindow === 'number' ? entry.failuresInWindow : 0;
                s.probeActive = typeof entry.probeActive === 'boolean' ? entry.probeActive : false;
                s.consecutiveSuccesses = typeof entry.consecutiveSuccesses === 'number' ? entry.consecutiveSuccesses : 0;
                s.lastCooldownDecay = typeof entry.lastCooldownDecay === 'number' ? entry.lastCooldownDecay : Date.now();
                s.failoverBlacklisted = typeof entry.failoverBlacklisted === 'boolean' ? entry.failoverBlacklisted : false;
                s.failoverCount = typeof entry.failoverCount === 'number' ? entry.failoverCount : 0;
            }
            return;
        }
        // Legacy format – warn and ignore
        if (parsed.providers) {
            console.warn('[health-monitor] Found legacy health.json with provider-wide keys. ' +
                'These are not migrated to per-model keys and will be ignored. Cooldown state starts fresh.');
            return;
        }
        // Otherwise treat as empty – nothing to load
    }
    catch {
        // corrupted file – ignore
    }
}
// Initialize from disk
loadPersisted();
// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────
/**
 * Record a successful API call for a given (provider, model).
 *
 * Resets the failure window, clears failover state, and advances
 * cooldown recovery (decrements cooldown level after 2 consecutive successes).
 * Persists the updated state to disk.
 */
export function recordSuccess(provider, model, latencyMs) {
    const s = ensureState(provider, model);
    s.totalRequests++;
    s.lastSuccess = Date.now();
    s.avgLatencyMs =
        s.avgLatencyMs > 0
            ? (s.avgLatencyMs * (s.totalRequests - 1) + latencyMs) / s.totalRequests
            : latencyMs;
    // Reset failure window and probe flag on any success.
    s.failuresInWindow = 0;
    s.failureWindowStart = 0;
    // Clear failover blacklist on any success.
    s.failoverCount = 0;
    s.failoverBlacklisted = false;
    // If we were in cooldown and a probe was in flight, clear cooldown now.
    if (s.blacklistedUntil !== null && s.blacklistedUntil > Date.now() && s.probeActive) {
        s.blacklistedUntil = null;
        s.probeActive = false;
    }
    // Clear expired cooldown.
    if (s.blacklistedUntil !== null && s.blacklistedUntil <= Date.now()) {
        s.blacklistedUntil = null;
    }
    // Cooldown decay on prolonged good behaviour (24h since last decay).
    if (s.cooldownLevel > 0 &&
        s.blacklistedUntil === null &&
        s.lastSuccess - s.lastCooldownDecay > COOLDOWN_DECAY_INTERVAL_MS) {
        s.cooldownLevel = Math.max(0, s.cooldownLevel - 1);
        s.lastCooldownDecay = s.lastSuccess;
    }
    // Recovery: consecutive successes decrement cooldown level.
    s.consecutiveSuccesses++;
    if (s.consecutiveSuccesses >= RECOVERY_SUCCESSES) {
        s.blacklistedUntil = null;
        s.cooldownLevel = Math.max(0, s.cooldownLevel - 1);
        s.consecutiveSuccesses = 0;
    }
    persist();
}
/**
 * Record a failure for a given (provider, model).
 *
 * Counts failures in a rolling window; if the threshold (5) is reached,
 * activates cooldown and increments the cooldown level.
 * Does NOT affect failover state.
 * Persists the updated state to disk.
 */
export function recordFailure(provider, model, _error) {
    const now = Date.now();
    const s = ensureState(provider, model);
    s.totalRequests++;
    s.failures++;
    s.lastFailure = now;
    s.consecutiveSuccesses = 0;
    // If a probe was in flight, escalate cooldown.
    if (s.blacklistedUntil !== null && s.blacklistedUntil > now && s.probeActive) {
        s.cooldownLevel = Math.min(s.cooldownLevel + 1, COOLDOWN_BACKOFF_MS.length - 1);
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
    // Trigger cooldown after threshold.
    if (s.failuresInWindow >= FAILURE_TRIGGER) {
        // Use the current level for the cooldown duration, then bump level
        // for the NEXT trigger. First trigger uses level 0 (30s); subsequent
        // triggers escalate. The probe-escalation branch above (already
        // correctly orders 'increment then use') handles probe failures.
        s.blacklistedUntil = now + getCooldownMs(s.cooldownLevel);
        s.cooldownLevel = Math.min(s.cooldownLevel + 1, COOLDOWN_BACKOFF_MS.length - 1);
        s.failuresInWindow = 0;
        s.failureWindowStart = 0;
        s.probeActive = true; // first request after cooldown expires is a probe
    }
    persist();
}
/**
 * Record a failover event for a given (provider, model).
 *
 * Increments the failover counter. If the counter reaches MAX_FAILOVERS (3),
 * marks the model as failover-blacklisted.
 * Does NOT affect cooldown state.
 * Persists the updated state to disk.
 */
export function recordFailoverEvent(provider, model) {
    const s = ensureState(provider, model);
    s.failoverCount++;
    if (s.failoverCount >= MAX_FAILOVERS) {
        s.failoverBlacklisted = true;
    }
    persist();
}
/**
 * Check whether a given (provider, model) is currently blacklisted.
 *
 * A model is blacklisted if either:
 * - failoverBlacklisted is true, OR
 * - a cooldown is active AND no probe is currently in flight.
 *
 * When a cooldown is active and no probe is in flight, one probe is allowed
 * through (sets probeActive=true, returns false). Subsequent calls while the
 * probe is pending will return true (blocked) until the probe resolves via
 * recordSuccess or recordFailure.
 */
export function isBlacklisted(provider, model) {
    const key = toKey(provider, model);
    const s = state.get(key);
    if (!s)
        return false;
    if (s.failoverBlacklisted)
        return true;
    const now = Date.now();
    if (s.blacklistedUntil !== null && s.blacklistedUntil > now) {
        if (!s.probeActive) {
            // Allow one probe through.
            s.probeActive = true;
            return false;
        }
        // A probe is already in flight – block further requests.
        return true;
    }
    return false;
}
/**
 * Return a snapshot of the health state for a given (provider, model),
 * or null if no entry exists.
 */
export function getHealth(provider, model) {
    const key = toKey(provider, model);
    const s = state.get(key);
    if (!s)
        return null;
    return stateToPublic(s);
}
/**
 * Return an array of all tracked health entries.
 */
export function getAllHealth() {
    return Array.from(state.values()).map(stateToPublic);
}
/**
 * Remove all health tracking for a given (provider, model) and persist.
 */
export function resetHealth(provider, model) {
    const key = toKey(provider, model);
    state.delete(key);
    persist();
}
// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────
function stateToPublic(s) {
    const now = Date.now();
    let status = 'healthy';
    if (s.failoverBlacklisted) {
        status = 'failover_blacklisted';
    }
    else if (s.blacklistedUntil !== null && s.blacklistedUntil > now && !s.probeActive) {
        status = 'cooldown';
    }
    return {
        provider: s.provider,
        model: s.model,
        status,
        totalRequests: s.totalRequests,
        avgLatencyMs: s.avgLatencyMs,
        failureCount: s.failures,
        failoverCount: s.failoverCount,
        failoverBlacklisted: s.failoverBlacklisted,
        cooldownLevel: s.cooldownLevel,
        cooldownUntil: s.blacklistedUntil,
        lastSuccessAt: s.lastSuccess > 0 ? s.lastSuccess : null,
        lastFailureAt: s.lastFailure > 0 ? s.lastFailure : null,
    };
}
//# sourceMappingURL=health-monitor.js.map