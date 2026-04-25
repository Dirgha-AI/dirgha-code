/**
 * fleet/runner.ts — Spawn and orchestrate N subagents in parallel worktrees.
 *
 * Each agent runs v2's agent-loop directly, NOT as a subprocess. cwd is
 * swapped per-agent via the ToolExecutor's `cwd`, so file operations are
 * isolated to the worktree without process isolation overhead.
 *
 * Flow:
 *   1. Resolve subtasks (decompose goal if not supplied).
 *   2. Create one worktree per subtask.
 *   3. Spawn agents under a bounded-concurrency semaphore.
 *   4. Forward per-agent AgentEvents + FleetEvents onto the parent stream.
 *   5. Gather results, compute totals, return FleetResult.
 *   6. Optional cleanup of worktrees.
 */
import { runAgentLoop } from '../kernel/agent-loop.js';
import { createEventStream } from '../kernel/event-stream.js';
import { extractText } from '../kernel/message.js';
import { ProviderRegistry } from '../providers/index.js';
import { builtInTools } from '../tools/index.js';
import { createToolRegistry } from '../tools/registry.js';
import { createToolExecutor } from '../tools/exec.js';
import { repairJSON } from '../utils/json-repair.js';
import { createWorktree, destroyWorktree, getRepoRoot, slug } from './worktree.js';
import { AGENT_TYPE_TOOLS, } from './types.js';
const DECOMPOSE_SYSTEM = `You are a task decomposer. Given a user goal, split it into 2-5 INDEPENDENT subtasks that can run in PARALLEL without conflicting with each other (no shared-file edits).

For each subtask, pick ONE agent type:
  - explore:  read-only codebase investigation
  - plan:     produces a step-by-step plan (no code changes)
  - verify:   reads code + runs tests/checks
  - code:     makes code changes
  - research: web search + browse

Output STRICT JSON only — no prose, no markdown fences:
{
  "subtasks": [
    { "id": "short-kebab-id", "title": "human title", "task": "precise agent prompt with file paths", "type": "code" }
  ]
}

Rules:
- Max 5 subtasks
- IDs are kebab-case, unique, <30 chars
- Each task prompt is self-contained (no "see above")
- Prefer explore+plan before code agents when goal is vague
- If the goal is ALREADY a single atomic task, return 1 subtask`;
/**
 * Run a fleet. Accepts either explicit `subtasks` or a bare `goal` that
 * will be decomposed via the planner model.
 */
export async function runFleet(config) {
    const started = Date.now();
    const cwd = config.cwd ?? process.cwd();
    const repoRoot = await getRepoRoot(cwd);
    const model = config.model ?? defaultModel();
    const plannerModel = config.plannerModel ?? model;
    const events = config.events ?? createEventStream();
    const providers = new ProviderRegistry();
    const subtasks = config.subtasks && config.subtasks.length > 0
        ? config.subtasks.map(normalizeSubtask)
        : await decomposeGoal(config.goal, plannerModel, providers);
    const worktrees = [];
    const agents = [];
    const goalSlug = slug(config.goal);
    for (const sub of subtasks) {
        const branch = `fleet/${goalSlug}/${sub.id}`;
        const handle = await createWorktree(branch, {
            repoRoot,
            worktreeBase: config.worktreeBase,
        });
        worktrees.push(handle);
        agents.push({
            id: sub.id,
            subtask: sub,
            status: 'pending',
            worktreePath: handle.path,
            branchName: handle.branch,
            startedAt: 0,
            output: '',
            bytesWritten: 0,
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 },
        });
    }
    emitFleetEvent(events, { type: 'fleet_start', goal: config.goal, agents: [...agents] });
    for (const a of agents)
        config.onAgent?.(a);
    await runWithConcurrency(agents, {
        providers,
        model,
        maxTurns: config.maxTurns ?? 15,
        timeoutMs: config.timeoutMs ?? 10 * 60 * 1000,
        concurrency: Math.max(1, config.concurrency ?? 3),
        events,
        signal: config.signal,
        verbose: config.verbose ?? false,
        onAgent: config.onAgent,
    });
    const successCount = agents.filter(a => a.status === 'completed').length;
    const failCount = agents.filter(a => a.status === 'failed' || a.status === 'cancelled').length;
    const durationMs = Date.now() - started;
    const totalTokens = agents.reduce((acc, a) => ({
        inputTokens: acc.inputTokens + a.usage.inputTokens,
        outputTokens: acc.outputTokens + a.usage.outputTokens,
        cachedTokens: acc.cachedTokens + a.usage.cachedTokens,
        costUsd: acc.costUsd + a.usage.costUsd,
    }), { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    emitFleetEvent(events, { type: 'fleet_end', goal: config.goal, successCount, failCount, durationMs });
    if (config.autoCleanup) {
        await Promise.allSettled(worktrees.map(wt => destroyWorktree(wt)));
    }
    return {
        goal: config.goal,
        agents,
        worktrees,
        successCount,
        failCount,
        durationMs,
        totalTokens,
        failed: agents.filter(a => a.status === 'failed' || a.status === 'cancelled'),
    };
}
async function runWithConcurrency(agents, opts) {
    const queue = [...agents];
    const inflight = new Set();
    while (queue.length > 0 || inflight.size > 0) {
        while (inflight.size < opts.concurrency && queue.length > 0) {
            const agent = queue.shift();
            const p = runOneAgent(agent, opts).finally(() => { inflight.delete(p); });
            inflight.add(p);
        }
        if (inflight.size > 0)
            await Promise.race(inflight);
    }
}
async function runOneAgent(agent, opts) {
    agent.status = 'running';
    agent.startedAt = Date.now();
    opts.onAgent?.(agent);
    const sessionId = `fleet-${agent.id}-${Date.now().toString(36)}`;
    agent.sessionId = sessionId;
    emitFleetEvent(opts.events, {
        type: 'fleet_agent_start',
        agentId: agent.id,
        subtask: agent.subtask,
        worktreePath: agent.worktreePath,
        branch: agent.branchName,
    });
    const controller = new AbortController();
    const parentListener = () => { controller.abort(); };
    opts.signal?.addEventListener('abort', parentListener, { once: true });
    const timer = setTimeout(() => { controller.abort(); }, opts.timeoutMs);
    const registry = agentRegistry(agent.subtask);
    const sanitized = registry.sanitize({ descriptionLimit: 200 });
    const executor = createToolExecutor({ registry, cwd: agent.worktreePath, sessionId });
    // Per-agent local event stream — we relay into parent + collect usage.
    const localEvents = createEventStream();
    const unsubscribe = localEvents.subscribe(ev => {
        opts.events.emit(ev);
        onLocalEvent(agent, ev, opts);
    });
    const messages = [
        { role: 'system', content: agentSystemPrompt(agent.subtask) },
        { role: 'user', content: agent.subtask.task },
    ];
    try {
        const result = await runAgentLoop({
            sessionId,
            model: agent.subtask.model ?? opts.model,
            messages,
            tools: sanitized.definitions,
            maxTurns: opts.maxTurns,
            provider: opts.providers.forModel(agent.subtask.model ?? opts.model),
            toolExecutor: executor,
            events: localEvents,
            signal: controller.signal,
        });
        agent.transcript = result.messages;
        agent.stopReason = result.stopReason;
        agent.usage = result.usage;
        const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant)
            agent.output = extractText(lastAssistant);
        if (result.stopReason === 'aborted') {
            agent.status = 'cancelled';
            agent.error = controller.signal.aborted && !opts.signal?.aborted
                ? `timeout after ${opts.timeoutMs}ms`
                : 'cancelled';
        }
        else if (result.stopReason === 'error') {
            agent.status = 'failed';
            agent.error = agent.error ?? 'agent-loop reported error';
        }
        else {
            agent.status = 'completed';
        }
    }
    catch (err) {
        agent.status = 'failed';
        agent.error = err instanceof Error ? err.message : String(err);
    }
    finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', parentListener);
        unsubscribe();
        localEvents.close();
    }
    agent.completedAt = Date.now();
    opts.onAgent?.(agent);
    emitFleetEvent(opts.events, {
        type: 'fleet_agent_end',
        agentId: agent.id,
        status: agent.status,
        error: agent.error,
        usage: agent.usage,
    });
}
/* Per-event side effects: text accumulation + verbose mirroring. */
function onLocalEvent(agent, ev, opts) {
    if (ev.type === 'text_delta') {
        agent.output += ev.delta;
        agent.bytesWritten += ev.delta.length;
        if (opts.verbose)
            process.stderr.write(`[${agent.id}] ${ev.delta}`);
        emitFleetEvent(opts.events, {
            type: 'fleet_agent_progress',
            agentId: agent.id,
            status: agent.status,
            bytes: agent.bytesWritten,
        });
    }
    else if (ev.type === 'error') {
        agent.error = ev.message;
    }
    else if (ev.type === 'usage') {
        agent.usage.inputTokens += ev.inputTokens;
        agent.usage.outputTokens += ev.outputTokens;
        agent.usage.cachedTokens += ev.cachedTokens ?? 0;
    }
    else if (ev.type === 'tool_exec_end') {
        // Counting tool executions lets us distinguish "agent did real work"
        // from "agent emitted text claiming completion without calling
        // anything" — a common LLM failure mode that previously inflated
        // fleet success counts.
        agent.toolExecCount = (agent.toolExecCount ?? 0) + 1;
    }
}
function agentRegistry(subtask) {
    const type = subtask.type ?? 'code';
    const allow = subtask.toolAllowlist ?? AGENT_TYPE_TOOLS[type];
    const allowSet = new Set(allow);
    const scoped = builtInTools.filter(t => allowSet.size === 0 ? true : allowSet.has(t.name));
    return createToolRegistry(scoped);
}
function agentSystemPrompt(subtask) {
    const type = subtask.type ?? 'code';
    const isCodeOrVerify = type === 'code' || type === 'verify';
    const toolMandate = isCodeOrVerify
        ? 'You MUST use the available tools (fs_write, fs_edit, shell, etc.) to make changes. Do NOT respond with text claiming you completed work — you have no effect on the filesystem unless you invoke a tool. After your tool calls, commit any new files with the git tool (`git add <file> && git commit -m "<msg>"`) so the work shows up on your branch.'
        : 'Use tools (fs_read, search_grep, etc.) to inspect the workspace. Respond with a short summary of what you found.';
    return `You are a fleet subagent focused on a single subtask.
Subtask: ${subtask.title}
Type: ${type}
Cwd: your assigned worktree (relative paths only — never write outside it).

${toolMandate}

When the subtask is genuinely complete, respond with a short one-line
summary of what you did — no apologies, no filler, no preamble.`;
}
function emitFleetEvent(events, ev) {
    // Fleet events are cast onto the AgentEvent stream so parent UIs that
    // understand extended events can render them; ones that don't will
    // treat them as opaque custom events via the `type` field.
    events.emit(ev);
}
function defaultModel() {
    return process.env['DIRGHA_MODEL'] ?? 'nvidia/minimaxai/minimax-m2.7';
}
function normalizeSubtask(s) {
    return {
        id: slug(s.id),
        title: s.title.slice(0, 80),
        task: s.task,
        type: s.type ?? 'code',
        model: s.model,
        toolAllowlist: s.toolAllowlist,
    };
}
/* ------------------------- decomposition -------------------------- */
/**
 * Decompose a goal into subtasks via an LLM call. Single-shot; falls back
 * to a 1-element list ({ id:slug(goal), task:goal, type:'code' }) on any
 * error or unparseable response.
 */
export async function decomposeGoal(goal, model, providers) {
    const provider = providers.forModel(model);
    const events = [];
    const stream = provider.stream({
        model,
        messages: [
            { role: 'system', content: DECOMPOSE_SYSTEM },
            { role: 'user', content: `Goal: ${goal}\n\nDecompose into parallel subtasks as JSON.` },
        ],
    });
    try {
        for await (const ev of stream)
            events.push(ev);
    }
    catch {
        return fallbackSubtask(goal);
    }
    const text = events
        .filter((e) => e.type === 'text_delta')
        .map(e => e.delta)
        .join('');
    return parseSubtasks(text, goal);
}
function parseSubtasks(raw, goal) {
    const match = /\{[\s\S]*"subtasks"[\s\S]*\}/m.exec(raw);
    if (!match)
        return fallbackSubtask(goal);
    const parsed = repairJSON(match[0]);
    if (!parsed || typeof parsed !== 'object')
        return fallbackSubtask(goal);
    const raw2 = parsed.subtasks;
    if (!Array.isArray(raw2) || raw2.length === 0)
        return fallbackSubtask(goal);
    const out = [];
    const seenIds = new Set();
    for (const item of raw2.slice(0, 5)) {
        if (!item || typeof item !== 'object')
            continue;
        const o = item;
        const baseId = typeof o.id === 'string' ? o.id : `task-${out.length + 1}`;
        let id = slug(baseId, 30);
        while (seenIds.has(id))
            id = `${id}-${out.length + 1}`;
        seenIds.add(id);
        const title = typeof o.title === 'string'
            ? o.title.slice(0, 80)
            : (typeof o.task === 'string' ? o.task.slice(0, 80) : `Subtask ${out.length + 1}`);
        const task = typeof o.task === 'string' ? o.task : (typeof o.title === 'string' ? o.title : goal);
        const type = isAgentType(o.type) ? o.type : 'code';
        out.push({ id, title, task, type });
    }
    return out.length > 0 ? out : fallbackSubtask(goal);
}
function isAgentType(v) {
    return v === 'explore' || v === 'plan' || v === 'verify'
        || v === 'code' || v === 'research' || v === 'custom';
}
function fallbackSubtask(goal) {
    return [{
            id: slug(goal) || 'main',
            title: goal.slice(0, 80),
            task: goal,
            type: 'code',
        }];
}
//# sourceMappingURL=runner.js.map