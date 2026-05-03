/**
 * Failover cascade engine. Multi-tier model substitution when the
 * primary provider returns 4xx/5xx, rate-limits, or times out.
 *
 * Strategy:
 *   1. primary      — user's chosen model (tier 1)
 *   2. secondary    — same-family fallback (tier 2)
 *   3. tertiary     — family-alternatives registry (tier 3)
 *   4. freeFallback — always-available free-tier model (tier 4)
 *   5. lastResort   — tencent/hy3-preview:free (always present, tier 5)
 *
 * Health-aware: skips tiers whose provider health score is below
 * the minimum threshold.
 *
 * Self-healing features:
 *   - Blacklists a model for the session after 5 consecutive failovers.
 *   - Logs every failover event via the injected session logger.
 *   - Guarantees tencent/hy3-preview:free is always in the chain as
 *     the absolute last resort when no other fallbacks are found.
 */
import { lookupModel, PRICES } from "../intelligence/prices.js";
import { familyAlternatives } from "../providers/family-fallback.js";
const LAST_RESORT_MODEL = "tencent/hy3-preview:free";
/**
 * Per-session state: tracks consecutive failover counts per model.
 * After 5 consecutive failovers on the same model, it is blacklisted
 * for the remainder of the session.
 */
const FAILOVER_BLACKLIST_THRESHOLD = 5;
const failoverCounts = new Map();
const blacklistedModels = new Set();
export function recordFailover(modelId, sessionLogger) {
    const count = (failoverCounts.get(modelId) ?? 0) + 1;
    failoverCounts.set(modelId, count);
    void Promise.resolve().then(async () => {
        if (sessionLogger) {
            await sessionLogger
                .append({
                type: "system",
                ts: new Date().toISOString(),
                event: "failover",
                data: {
                    model: modelId,
                    consecutiveFailovers: count,
                    blacklisted: count >= FAILOVER_BLACKLIST_THRESHOLD,
                },
            })
                .catch(() => {
                /* best-effort logging */
            });
        }
    });
    if (count >= FAILOVER_BLACKLIST_THRESHOLD) {
        blacklistedModels.add(modelId);
    }
}
export function isBlacklisted(modelId) {
    return blacklistedModels.has(modelId);
}
export function resetFailoverState() {
    failoverCounts.clear();
    blacklistedModels.clear();
}
export function resetModelBlacklist(modelId) {
    failoverCounts.delete(modelId);
    blacklistedModels.delete(modelId);
}
export function buildFailoverChain(modelId, opts = {}) {
    const maxTiers = opts.maxTiers ?? 4;
    const healthThreshold = opts.healthThreshold ?? -1;
    const seen = new Set();
    const tiers = [];
    // Skip the primary if it is blacklisted this session.
    if (!isBlacklisted(modelId)) {
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
            if (isBlacklisted(m.model))
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
        if (isBlacklisted(alt.model))
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
    const free = PRICES.find((p) => p.outputPerM === 0 && p.inputPerM === 0 && !seen.has(p.model));
    if (free && !isBlacklisted(free.model) && !seen.has(free.model)) {
        tiers.push({ model: free.model, reason: "free-fallback" });
        seen.add(free.model);
        if (tiers.length >= maxTiers)
            return finalize(tiers, seen);
    }
    // Tier 5 — guaranteed last-resort: tencent/hy3-preview:free
    // Always available via OpenRouter when OPENROUTER_API_KEY is set.
    // Always added as the absolute last stop so no session is left without
    // any fallback, even if the catalogue has no free models.
    if (!isBlacklisted(LAST_RESORT_MODEL) && !seen.has(LAST_RESORT_MODEL)) {
        tiers.push({ model: LAST_RESORT_MODEL, reason: "last-resort" });
        seen.add(LAST_RESORT_MODEL);
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