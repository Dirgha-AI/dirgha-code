/**
 * Failover cascade engine. Multi-tier model substitution when the
 * primary provider returns 4xx/5xx, rate-limits, or times out.
 *
 * Strategy:
 *   1. primary      — user's chosen model (tier 1)
 *   2. secondary    — same-family fallback (tier 2)
 *   3. tertiary     — family-alternatives registry (tier 3)
 *   4. freeFallback — always-available free-tier model (tier 4)
 *
 * Health-aware: skips tiers whose provider health score is below
 * the minimum threshold.
 *
 * Self-healing features:
 *   - Blacklists a model for the session after 5 consecutive failovers.
 *   - Logs every failover event via the injected session logger.
 *   - Falls through to the cheapest free model from the catalog when
 *     no paid or family-alternative model is available.
 *
 * Failover blacklist state now lives in health-monitor.ts (unified).
 * This file delegates to health-monitor for persistent blacklist checks.
 */
import { isBlacklisted, recordFailoverEvent, resetHealth } from './health-monitor.js';
import { PRICES } from './prices.js';
import { lookupModel } from './prices.js';
import { familyAlternatives } from '../providers/family-fallback.js';
// Demoted 2026-05-08 — both models hang on NIM (verified live). Still
// in the catalogue for manual `--model` selection; just not auto-picked.
const AUTO_FAILOVER_BLACKLIST = new Set([
    "minimaxai/minimax-m2.7",
    "meta/llama-4-maverick-17b-128e-instruct",
]);
// ──────────────────────────────────────────────────────────
// One-time warning tracking for unknown models
// ──────────────────────────────────────────────────────────
const unknownModelWarned = new Set();
// ──────────────────────────────────────────────────────────
// Local helper: is a model blacklisted in the unified health state?
// ──────────────────────────────────────────────────────────
function isModelBlacklisted(modelId) {
    const entry = PRICES.find(p => p.model === modelId);
    if (!entry)
        return false; // unknown model – can't check unified state
    return isBlacklisted(entry.provider, modelId);
}
export function recordFailover(modelId, sessionLogger) {
    // Update unified blacklist in health-monitor.
    const entry = PRICES.find(p => p.model === modelId);
    if (entry) {
        recordFailoverEvent(entry.provider, modelId);
    }
    else {
        if (!unknownModelWarned.has(modelId)) {
            unknownModelWarned.add(modelId);
            console.warn(`[failover-chain] unknown model: ${modelId}`);
        }
    }
    // Session logger — logs regardless of whether the unified update succeeded.
    void Promise.resolve().then(async () => {
        if (sessionLogger) {
            await sessionLogger
                .append({
                type: "system",
                ts: new Date().toISOString(),
                event: "failover",
                data: {
                    model: modelId,
                },
            })
                .catch(() => {
                /* best-effort logging */
            });
        }
    });
}
export function resetFailoverState() {
    // State is now in health-monitor; use resetHealth(provider, model) per pair to reset.
}
export function resetModelBlacklist(modelId) {
    const entry = PRICES.find(p => p.model === modelId);
    if (!entry)
        return;
    resetHealth(entry.provider, modelId);
}
export function buildFailoverChain(modelId, opts = {}) {
    const maxTiers = opts.maxTiers ?? 4;
    const healthThreshold = opts.healthThreshold ?? -1;
    const seen = new Set();
    const tiers = [];
    // Skip the primary if it is blacklisted in unified state.
    if (!isModelBlacklisted(modelId)) {
        tiers.push({ model: modelId, reason: "user-selected" });
        seen.add(modelId);
    }
    if (tiers.length >= maxTiers)
        return finalize(tiers, seen);
    // Tier 2 — same-family alternatives from the catalogue
    const price = lookupModel(modelId);
    if (price?.family) {
        const familyModels = PRICES.filter((p) => p.family === price.family &&
            !seen.has(p.model) &&
            p.provider !== price.provider).sort((a, b) => a.outputPerM + a.inputPerM - (b.outputPerM + b.inputPerM));
        for (const m of familyModels) {
            if (isModelBlacklisted(m.model))
                continue;
            if (!isHealthy(m.provider, opts.healthScores, healthThreshold))
                continue;
            if (seen.has(m.model))
                continue;
            seen.add(m.model);
            tiers.push({
                model: m.model,
                reason: `same-family/${price.family}`,
            });
            if (tiers.length >= maxTiers)
                return finalize(tiers, seen);
        }
    }
    // Tier 3 — familyAlternatives registry (cross-family provider map)
    const fam = familyAlternatives(modelId);
    for (const alt of fam) {
        if (isModelBlacklisted(alt.model))
            continue;
        if (seen.has(alt.model))
            continue;
        if (!isHealthy(alt.provider, opts.healthScores, healthThreshold))
            continue;
        seen.add(alt.model);
        tiers.push({ model: alt.model, reason: `family-registry` });
        if (tiers.length >= maxTiers)
            return finalize(tiers, seen);
    }
    // Tier 4 — first free model as last resort
    const free = PRICES.find((p) => p.outputPerM === 0 &&
        p.inputPerM === 0 &&
        !seen.has(p.model) &&
        !AUTO_FAILOVER_BLACKLIST.has(p.model));
    if (free && !isModelBlacklisted(free.model) && !seen.has(free.model)) {
        tiers.push({ model: free.model, reason: "free-fallback" });
        seen.add(free.model);
        if (tiers.length >= maxTiers)
            return finalize(tiers, seen);
    }
    return finalize(tiers, seen);
}
function finalize(tiers, _seen) {
    return { tiers, exhausted: tiers.length <= 1 };
}
function isHealthy(provider, scores, threshold) {
    if (threshold < 0)
        return true;
    const score = scores?.[provider] ?? 1;
    return score >= threshold;
}
//# sourceMappingURL=failover-chain.js.map