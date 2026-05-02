const WINDOW_MS = 5 * 60 * 1000; // 5 min sliding window
const windows = new Map();
const rateLimitHits = new Map();
const costFactors = {
    anthropic: 1.5,
    openai: 1.4,
    gemini: 1.0,
    openrouter: 1.2,
    nvidia: 0.5,
    fireworks: 1.0,
    groq: 0.8,
    mistral: 0.9,
    deepseek: 0.7,
    ollama: 0.0,
    llamacpp: 0.0,
    cohere: 1.0,
    cerebras: 0.8,
    together: 0.9,
    perplexity: 1.1,
    xai: 1.0,
    zai: 0.9,
};
// Periodic compaction to prevent unbounded map growth in daemon
// mode. unref() ensures the timer doesn't keep the process alive.
setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [provider, w] of windows) {
        const pruned = w.filter((e) => e.time > cutoff);
        if (pruned.length === 0) {
            windows.delete(provider);
            rateLimitHits.delete(provider);
        }
        else {
            windows.set(provider, pruned);
        }
    }
}, 60_000).unref();
export function recordRequest(provider, ok, latMs) {
    const w = windows.get(provider) ?? [];
    w.push({ time: Date.now(), ok, latMs });
    const cutoff = Date.now() - WINDOW_MS;
    windows.set(provider, w.filter((e) => e.time > cutoff));
}
export function recordRateLimit(provider) {
    rateLimitHits.set(provider, (rateLimitHits.get(provider) ?? 0) + 1);
}
export function healthScore(provider) {
    const w = windows.get(provider) ?? [];
    const total = w.length || 1;
    const errors = w.filter((e) => !e.ok).length;
    const errorScore = 1.0 - errors / total;
    const latencies = w
        .filter((e) => e.ok && Number.isFinite(e.latMs))
        .map((e) => e.latMs);
    const avgLat = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : errors > 0
            ? 5000
            : 1000;
    const latScore = Math.max(0, 1.0 - avgLat / 5000);
    const rlHits = rateLimitHits.get(provider) ?? 0;
    const decayFactor = Math.pow(0.5, rlHits);
    const rlScore = decayFactor;
    const cost = costFactors[provider] ?? 1.0;
    const costScore = Math.max(0, 1.0 - cost / 2.0);
    return errorScore * 0.35 + latScore * 0.25 + rlScore * 0.2 + costScore * 0.2;
}
export function bestProvider(providers) {
    if (providers.length === 0)
        throw new Error("bestProvider requires at least one provider");
    let best = providers[0];
    let bestScore = healthScore(best);
    for (let i = 1; i < providers.length; i++) {
        const score = healthScore(providers[i]);
        if (score > bestScore) {
            best = providers[i];
            bestScore = score;
        }
    }
    return best;
}
export function resetHealth(provider) {
    windows.delete(provider);
    rateLimitHits.delete(provider);
}
//# sourceMappingURL=health.js.map