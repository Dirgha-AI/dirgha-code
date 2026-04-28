/**
 * Internal regression suite runner. Each task runs the full agent loop
 * in a temp working directory; success criteria come from
 * EvalTask.expectedArtifact. Suites ship as JSON under datasets/.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createEventStream } from '../kernel/event-stream.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import { ProviderRegistry } from '../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../tools/index.js';
export async function runRegressionSuite(tasks, opts) {
    const providers = opts.providers ?? new ProviderRegistry();
    const results = [];
    const started = Date.now();
    for (const task of tasks) {
        results.push(await runOne(task, providers, opts.model));
    }
    return {
        suite: opts.suiteName ?? 'regression',
        model: opts.model,
        runAt: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        durationMs: Date.now() - started,
        results,
    };
}
async function runOne(task, providers, model) {
    const cwd = mkdtempSync(join(tmpdir(), 'dirgha-eval-'));
    const sessionId = randomUUID();
    const events = createEventStream();
    const registry = createToolRegistry(builtInTools);
    const executor = createToolExecutor({ registry, cwd, sessionId });
    const sanitized = registry.sanitize({ descriptionLimit: 200 });
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    events.subscribe(ev => {
        if (ev.type === 'usage') {
            inputTokens += ev.inputTokens;
            outputTokens += ev.outputTokens;
        }
    });
    const messages = [];
    if (task.system)
        messages.push({ role: 'system', content: task.system });
    messages.push({ role: 'user', content: task.prompt });
    let verdict;
    try {
        const result = await runAgentLoop({
            sessionId,
            model,
            messages,
            tools: sanitized.definitions,
            maxTurns: task.maxTurns ?? 12,
            provider: providers.forModel(model),
            toolExecutor: executor,
            events,
        });
        const check = await checkArtifact(cwd, task);
        verdict = {
            taskId: task.id,
            ok: check.ok && result.stopReason !== 'error',
            reason: check.reason,
            durationMs: Date.now() - started,
            usage: { inputTokens, outputTokens, costUsd: 0 },
        };
    }
    catch (err) {
        verdict = {
            taskId: task.id,
            ok: false,
            reason: `exception: ${err instanceof Error ? err.message : String(err)}`,
            durationMs: Date.now() - started,
        };
    }
    return verdict;
}
async function checkArtifact(cwd, task) {
    const expected = task.expectedArtifact;
    if (!expected)
        return { ok: true, reason: 'no artifact check required' };
    const content = await readFile(join(cwd, expected.path), 'utf8').catch(() => undefined);
    if (content === undefined)
        return { ok: false, reason: `artifact missing: ${expected.path}` };
    const contains = expected.containsAnyOf ?? [];
    if (contains.length > 0 && !contains.some(s => content.includes(s))) {
        return { ok: false, reason: `artifact lacks any of expected markers` };
    }
    const excludes = expected.excludes ?? [];
    for (const ex of excludes) {
        if (content.includes(ex))
            return { ok: false, reason: `artifact contains forbidden token: ${ex}` };
    }
    return { ok: true, reason: 'artifact passed' };
}
export function loadTasksFromJson(path) {
    const text = readFileSync(path, 'utf8');
    return JSON.parse(text);
}
//# sourceMappingURL=regression.js.map