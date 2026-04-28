/**
 * fleet/tripleshot.ts — Spawn 3 stylistic variants, ask a judge, pick
 * the winner.
 *
 * For high-stakes tasks: the same goal is sent to three agents with
 * different stylistic framings (conservative / balanced / bold), each
 * in its own worktree. A judge agent is then asked to read the diffs
 * and pick the best one. Optionally auto-applies the winner back.
 *
 * The judge prompt is intentionally small and produces strict JSON so
 * parsing is deterministic; we fall back to the first completed variant
 * when the judge misbehaves.
 */
import { runFleet } from './runner.js';
import { applyBack } from './apply-back.js';
import { getHeadSha } from './worktree.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProviderRegistry } from '../providers/index.js';
import { createEventStream } from '../kernel/event-stream.js';
import { repairJSON } from '../utils/json-repair.js';
const pexec = promisify(execFile);
const VARIATIONS = [
    {
        id: 'conservative',
        style: 'Prioritize minimal changes, safety, and backward compatibility. Prefer the smallest diff that satisfies the goal.',
    },
    {
        id: 'balanced',
        style: 'Balance correctness with cleanliness. Refactor only when it clearly improves readability and stay focused on the stated goal.',
    },
    {
        id: 'bold',
        style: 'Optimize for long-term code quality. Aggressively refactor adjacent code that is clearly improved by the change, without breaking public APIs.',
    },
];
const JUDGE_SYSTEM = `You are a strict code-review judge. You will be shown a goal and up to 3 candidate diffs from variants named "conservative", "balanced", and "bold".

Pick the BEST one by:
  - Correctness — does it actually solve the goal?
  - Simplicity — smallest diff that is still correct.
  - Style fit — consistent with the apparent repo conventions.
  - No regressions — don't break adjacent code.

Output STRICT JSON only, no prose, no markdown:
{ "winner": "conservative|balanced|bold", "runner_up": "conservative|balanced|bold", "reason": "<1-2 sentences>" }`;
export async function runTripleshot(goal, config) {
    const started = Date.now();
    const subtasks = VARIATIONS.map(v => ({
        id: `${v.id}`,
        title: `[${v.id}] ${goal}`.slice(0, 80),
        task: `${goal}\n\nStylistic guidance: ${v.style}`,
        type: 'code',
    }));
    const fleetResult = await runFleet({
        ...config,
        goal,
        subtasks,
        concurrency: 3,
    });
    const providers = new ProviderRegistry();
    const judgeModel = config.judgeModel ?? config.plannerModel ?? config.model ?? defaultModel();
    const events = config.events ?? createEventStream();
    const shots = [];
    const repoRoot = fleetResult.worktrees[0]?.repoRoot;
    const parentHead = repoRoot ? await getHeadSha(repoRoot) : '';
    for (const a of fleetResult.agents) {
        if (a.status !== 'completed')
            continue;
        const variant = VARIATIONS.find(v => a.id === v.id)?.id;
        if (!variant)
            continue;
        let diff = '';
        try {
            await pexec('git', ['add', '-A'], { cwd: a.worktreePath });
            const { stdout } = await pexec('git', ['diff', parentHead, '--'], {
                cwd: a.worktreePath,
                maxBuffer: 20 * 1024 * 1024,
            });
            diff = stdout;
        }
        catch { /* skip empty */ }
        if (diff.trim()) {
            shots.push({ variant, agent: a, diff: diff.slice(0, 8000) });
        }
    }
    const tokens = { ...fleetResult.totalTokens };
    if (shots.length === 0) {
        return {
            goal,
            winner: null,
            runnerUp: null,
            reason: 'No variant produced a diff',
            shots: [],
            agents: fleetResult.agents,
            worktrees: fleetResult.worktrees,
            totalTokens: tokens,
            durationMs: Date.now() - started,
        };
    }
    if (shots.length === 1) {
        const only = shots[0];
        const ab = config.autoMerge
            ? await applyBack(handleFor(fleetResult.worktrees, only.agent.worktreePath), {
                message: `triple: ${only.variant} (${goal.slice(0, 40)})`,
            })
            : undefined;
        return {
            goal,
            winner: only.variant,
            runnerUp: null,
            reason: 'Only one variant completed',
            shots,
            agents: fleetResult.agents,
            worktrees: fleetResult.worktrees,
            apply: ab,
            totalTokens: tokens,
            durationMs: Date.now() - started,
        };
    }
    const { winner, runnerUp, reason, usage: judgeUsage } = await askJudge(goal, shots, judgeModel, providers, events);
    accumulate(tokens, judgeUsage);
    let apply;
    if (config.autoMerge && winner) {
        const winShot = shots.find(s => s.variant === winner);
        if (winShot) {
            const handle = handleFor(fleetResult.worktrees, winShot.agent.worktreePath);
            apply = await applyBack(handle, { message: `triple: ${winner} (${goal.slice(0, 40)})` });
        }
    }
    return {
        goal,
        winner,
        runnerUp,
        reason,
        shots,
        agents: fleetResult.agents,
        worktrees: fleetResult.worktrees,
        apply,
        totalTokens: tokens,
        durationMs: Date.now() - started,
    };
}
async function askJudge(goal, shots, judgeModel, providers, events) {
    const prompt = `GOAL: ${goal}\n\n` +
        shots.map(s => `=== ${s.variant.toUpperCase()} ===\n${s.diff}\n`).join('\n') +
        `\nPick the best variant. Output JSON only.`;
    const provider = providers.forModel(judgeModel);
    const streamEvents = [];
    try {
        for await (const ev of provider.stream({
            model: judgeModel,
            messages: [
                { role: 'system', content: JUDGE_SYSTEM },
                { role: 'user', content: prompt },
            ],
        })) {
            streamEvents.push(ev);
            events.emit(ev);
        }
    }
    catch (err) {
        return {
            winner: shots[0]?.variant ?? null,
            runnerUp: shots[1]?.variant ?? null,
            reason: `Judge error: ${err instanceof Error ? err.message : String(err)}`,
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 },
        };
    }
    const text = streamEvents
        .filter((e) => e.type === 'text_delta')
        .map(e => e.delta)
        .join('');
    const usage = streamEvents
        .filter((e) => e.type === 'usage')
        .reduce((acc, e) => ({
        inputTokens: acc.inputTokens + e.inputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        cachedTokens: acc.cachedTokens + (e.cachedTokens ?? 0),
        costUsd: acc.costUsd,
    }), { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    return parseVerdict(text, shots, usage);
}
function parseVerdict(text, shots, usage) {
    const defaultVerdict = {
        winner: shots[0]?.variant ?? null,
        runnerUp: shots[1]?.variant ?? null,
        reason: 'Judge output unparseable; defaulted to first completed variant.',
        usage,
    };
    const match = /\{[\s\S]*?\}/.exec(text);
    if (!match)
        return defaultVerdict;
    const parsed = repairJSON(match[0]);
    if (!parsed || typeof parsed !== 'object')
        return defaultVerdict;
    const rec = parsed;
    const winner = isVariant(rec.winner) ? rec.winner : defaultVerdict.winner;
    const runnerUp = isVariant(rec.runner_up) ? rec.runner_up : defaultVerdict.runnerUp;
    const reason = typeof rec.reason === 'string' ? rec.reason : 'No reason given.';
    return { winner, runnerUp: winner === runnerUp ? null : runnerUp, reason, usage };
}
function isVariant(v) {
    return v === 'conservative' || v === 'balanced' || v === 'bold';
}
function accumulate(total, add) {
    total.inputTokens += add.inputTokens;
    total.outputTokens += add.outputTokens;
    total.cachedTokens += add.cachedTokens;
    total.costUsd += add.costUsd;
}
function handleFor(worktrees, path) {
    const wt = worktrees.find(w => w.path === path);
    if (!wt) {
        throw new Error(`tripleshot: no worktree handle for path ${path}`);
    }
    return wt;
}
function defaultModel() {
    return process.env['DIRGHA_MODEL'] ?? 'nvidia/minimaxai/minimax-m2.7';
}
//# sourceMappingURL=tripleshot.js.map