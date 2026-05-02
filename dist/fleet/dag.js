/**
 * Fleet DAG — sequential agent-to-agent chaining.
 *
 * Usage:
 *   dirgha fleet dag "step1: investigate auth flow" "step2: implement fix based on step1" "step3: verify fix"
 *
 * Each step runs as an independent agent in a shared worktree. Step N
 * receives the full transcript of step N-1 as its context so the chain
 * builds cumulatively. The final step's output is the DAG result.
 */
import { randomUUID } from "node:crypto";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import { createToolExecutor } from "../tools/exec.js";
export async function runDag(opts) {
    const sessionId = opts.sessionId ?? randomUUID();
    const maxTurns = Math.max(1, opts.maxTurnsPerStep ?? 8);
    const total = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
    };
    const stepResults = [];
    let cumulativeContext = "";
    for (let i = 0; i < opts.steps.length; i++) {
        const step = opts.steps[i];
        const events = createEventStream();
        const executor = createToolExecutor({
            registry: opts.registry,
            cwd: opts.cwd,
            sessionId,
        });
        const sanitized = opts.registry.sanitize({ descriptionLimit: 200 });
        const provider = opts.providers.forModel(opts.config.model);
        const messages = [];
        const prompt = cumulativeContext.length > 0
            ? `Previous step result:\n${cumulativeContext}\n\nNext step: ${step.goal}`
            : step.goal;
        messages.push({ role: "user", content: prompt });
        let output = "";
        events.subscribe((ev) => {
            if (ev.type === "text_delta")
                output += ev.delta;
        });
        const result = await runAgentLoop({
            sessionId,
            model: opts.config.model,
            messages,
            tools: sanitized.definitions,
            maxTurns,
            provider,
            toolExecutor: executor,
            events,
        });
        cumulativeContext =
            output || `[Step ${i + 1} completed with no text output]`;
        total.inputTokens += result.usage.inputTokens;
        total.outputTokens += result.usage.outputTokens;
        total.cachedTokens += result.usage.cachedTokens;
        total.costUsd += result.usage.costUsd;
        stepResults.push({
            goal: step.goal,
            stopReason: result.stopReason,
            output: cumulativeContext.length > 2000
                ? cumulativeContext.slice(0, 2000) + "..."
                : cumulativeContext,
            usage: result.usage,
            messages: result.messages,
        });
        if (result.stopReason === "error") {
            return { steps: stepResults, usage: total, success: false };
        }
    }
    return { steps: stepResults, usage: total, success: true };
}
//# sourceMappingURL=dag.js.map