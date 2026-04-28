/**
 * Parity runner. For each scenario, spins up a mock server, points the
 * provider adapter at it, collects events, and diffs against the
 * scenario's expected type sequence. Reports success/failure with a
 * per-scenario diff.
 */
import { NvidiaProvider } from '../providers/nvidia.js';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { OpenAIProvider } from '../providers/openai.js';
import { startMockOpenAICompat } from './mock-openai-compat.js';
export async function runParity(scenarios) {
    const results = [];
    for (const scenario of scenarios) {
        results.push(await runScenario(scenario));
    }
    return {
        total: results.length,
        passed: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        scenarios: results,
    };
}
async function runScenario(scenario) {
    const mock = await startMockOpenAICompat([{ chunks: scenario.mockChunks }]);
    try {
        const provider = makeProvider(scenario.provider, mock.url);
        const events = [];
        for await (const ev of provider.stream({ model: scenario.model, messages: scenario.request.messages, tools: scenario.request.tools })) {
            events.push(ev);
        }
        const actualTypes = events.map(e => e.type);
        const ok = sameSequence(actualTypes, scenario.expectedEventTypes);
        return {
            name: scenario.name,
            ok,
            expected: [...scenario.expectedEventTypes],
            actual: actualTypes,
            diff: ok ? undefined : diffSequences(scenario.expectedEventTypes, actualTypes),
        };
    }
    finally {
        await mock.close();
    }
}
function makeProvider(id, baseUrl) {
    switch (id) {
        case 'nvidia':
            return new NvidiaProvider({ apiKey: 'test', baseUrl, timeoutMs: 5000 });
        case 'openrouter':
            return new OpenRouterProvider({ apiKey: 'test', baseUrl, timeoutMs: 5000 });
        case 'openai':
            return new OpenAIProvider({ apiKey: 'test', baseUrl, timeoutMs: 5000 });
        case 'anthropic':
        case 'gemini':
            throw new Error(`Parity mock for ${id} not yet implemented in runner`);
    }
}
function sameSequence(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
function diffSequences(expected, actual) {
    const max = Math.max(expected.length, actual.length);
    const lines = [];
    for (let i = 0; i < max; i++) {
        const e = expected[i] ?? '(none)';
        const a = actual[i] ?? '(none)';
        lines.push(`${i === 0 ? ' idx' : ''.padStart(4)}  expected=${e.padEnd(18)} actual=${a}${e === a ? '' : '  <-- mismatch'}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=runner.js.map