/**
 * Terminal-Bench runner stub. Benchmarks agent terminal interactions
 * against scripted scenarios (shell recipes, navigational tasks). The
 * real runner requires a container harness to isolate state; that
 * integration ships separately.
 */
export async function runTerminalBench(config) {
    return {
        suite: 'terminal-bench',
        model: config.model,
        runAt: new Date().toISOString(),
        total: 0,
        passed: 0,
        failed: 0,
        durationMs: 0,
        results: [],
    };
}
//# sourceMappingURL=terminal-bench.js.map