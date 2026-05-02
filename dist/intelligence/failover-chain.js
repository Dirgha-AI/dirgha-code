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
 */
import { lookupModel, PRICES } from "../intelligence/prices.js";
import { familyAlternatives } from "../providers/family-fallback.js";
export function buildFailoverChain(modelId, opts = {}) {
    const maxTiers = opts.maxTiers ?? 4;
    const healthThreshold = opts.healthThreshold ?? -1;
    const seen = new Set();
    const tiers = [];
    tiers.push({ model: modelId, reason: "user-selected" });
    seen.add(modelId);
    if (tiers.length >= maxTiers)
        return { tiers, exhausted: false };
    // Tier 2 — same-family alternatives from the catalogue
    const price = lookupModel(modelId);
    if (price?.family) {
        const familyModels = PRICES.filter((p) => p.family === price.family &&
            !seen.has(p.model) &&
            p.provider !== price.provider).sort((a, b) => a.outputPerM + a.inputPerM - (b.outputPerM + b.inputPerM));
        for (const m of familyModels) {
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
                return { tiers, exhausted: false };
        }
    }
    // Tier 3 — familyAlternatives registry (cross-family provider map)
    const fam = familyAlternatives(modelId);
    for (const alt of fam) {
        if (seen.has(alt.model))
            continue;
        if (!isHealthy(alt.provider, opts.healthScores, healthThreshold))
            continue;
        seen.add(alt.model);
        tiers.push({ model: alt.model, reason: `family-registry` });
        if (tiers.length >= maxTiers)
            return { tiers, exhausted: false };
    }
    // Tier 4 — first free model as last resort
    const free = PRICES.find((p) => p.outputPerM === 0 && p.inputPerM === 0 && !seen.has(p.model));
    if (free && !seen.has(free.model)) {
        tiers.push({ model: free.model, reason: "free-fallback" });
    }
    return { tiers, exhausted: tiers.length <= 1 };
}
function isHealthy(provider, scores, threshold) {
    if (threshold < 0)
        return true;
    const score = scores?.[provider] ?? 1;
    return score >= threshold;
}
//# sourceMappingURL=failover-chain.js.map