/**
 * Agent loop: ReAct with optional plan-then-execute.
 *
 * The loop is the sole caller of Provider.stream and the sole caller of
 * ToolExecutor.execute. All layering conventions are enforced here:
 *
 *   1. Every tool call passes through the ApprovalBus seam.
 *   2. Every event flows through the EventStream (no side-channels).
 *   3. Errors from providers are classified by the injected ErrorClassifier
 *      before any retry decision; there is no string matching.
 *   4. Context transform (compaction, skill injection) is invoked once per
 *      turn before the provider call, never mid-stream.
 */
import { assembleTurn, extractToolUses, appendToolResults } from "./message.js";
import { resolveModelForDispatch } from "../providers/dispatch.js";
import { findFailover } from "../intelligence/prices.js";
import { recordRequest, recordRateLimit } from "../providers/health.js";
export async function runAgentLoop(cfg) {
    const events = cfg.events;
    const history = [...cfg.messages];
    const totals = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
    };
    let stopReason = "end_turn";
    let turnCount = 0;
    let retriesForTurn = 0;
    const MAX_RETRIES = 3;
    events.emit({
        type: "agent_start",
        sessionId: cfg.sessionId,
        model: cfg.model,
    });
    try {
        for (let turnIndex = 0; turnIndex < cfg.maxTurns; turnIndex++) {
            if (cfg.signal?.aborted) {
                stopReason = "aborted";
                break;
            }
            if (cfg.hooks?.beforeTurn) {
                const decision = await cfg.hooks.beforeTurn(turnIndex, history);
                if (decision === "abort") {
                    stopReason = "aborted";
                    break;
                }
            }
            if (cfg.loopDetector?.isLoopDetected()) {
                const loopReason = cfg.loopDetector.reason() ?? "loop detected";
                events.emit({
                    type: "error",
                    message: `Sub-agent aborted: ${loopReason}`,
                    reason: "loop",
                    retryable: false,
                });
                stopReason = "loop";
                break;
            }
            turnCount = turnIndex + 1;
            const turnId = `t${turnIndex}-${Date.now().toString(36)}`;
            const messagesForCall = cfg.contextTransform
                ? await cfg.contextTransform(history)
                : history;
            const streamEvents = [];
            try {
                const dispatchModel = resolveModelForDispatch(cfg.model);
                for await (const ev of cfg.provider.stream({
                    model: dispatchModel,
                    messages: messagesForCall,
                    tools: cfg.tools,
                    signal: cfg.signal,
                })) {
                    streamEvents.push(ev);
                    events.emit(ev);
                    if (cfg.signal?.aborted)
                        break;
                }
            }
            catch (err) {
                // An AbortError mid-stream is a clean cancellation, not a
                // failure. Distinguish so callers (and `dirgha audit`) see
                // `stopReason: 'aborted'` instead of misleading 'error'.
                const isAbort = (err instanceof Error &&
                    (err.name === "AbortError" ||
                        /aborted|abort/i.test(err.message))) ||
                    cfg.signal?.aborted === true;
                if (isAbort) {
                    stopReason = "aborted";
                    events.emit({ type: "turn_end", turnId, stopReason });
                    break;
                }
                const classified = cfg.errorClassifier?.classify(err, cfg.provider.id, cfg.model);
                recordRequest(cfg.provider.id, false, 0);
                if (classified?.reason === "rate_limit")
                    recordRateLimit(cfg.provider.id);
                // Suggest a known-good fallback model so the TUI can prompt the
                // user to switch instead of just dead-ending the turn. Only
                // fires for errors that look fixable by swapping models —
                // bad-id (400 "not a valid model"), deprecated, rate-limit,
                // or 5xx upstream failures.
                const errMsg = err instanceof Error ? err.message : String(err);
                const looksFixable = /not a valid model id|deprecated|model_not_found|rate.?limit|429\b|5\d\d\b|bad.?gateway|upstream/i.test(errMsg);
                const failover = looksFixable ? findFailover(cfg.model) : undefined;
                events.emit({
                    type: "error",
                    message: errMsg,
                    reason: classified?.reason,
                    retryable: classified?.retryable ?? false,
                    ...(classified?.userMessage !== undefined
                        ? { userMessage: classified.userMessage }
                        : {}),
                    ...(failover !== undefined ? { failoverModel: failover } : {}),
                });
                if (classified?.retryable && retriesForTurn < MAX_RETRIES) {
                    retriesForTurn++;
                    const backoff = classified.backoffMs ?? 1000;
                    await new Promise((r) => setTimeout(r, backoff));
                    turnIndex--;
                    continue;
                }
                stopReason = "error";
                events.emit({ type: "turn_end", turnId, stopReason });
                break;
            }
            const assembled = assembleTurn(streamEvents);
            totals.inputTokens += assembled.inputTokens;
            totals.outputTokens += assembled.outputTokens;
            totals.cachedTokens += assembled.cachedTokens;
            recordRequest(cfg.provider.id, true, 0);
            retriesForTurn = 0;
            if (cfg.costCalculator) {
                totals.costUsd += cfg.costCalculator(assembled.inputTokens, assembled.outputTokens, assembled.cachedTokens);
            }
            history.push(assembled.message);
            const toolUses = extractToolUses(assembled.message);
            cfg.loopDetector?.track({
                toolCalls: toolUses.map((t) => ({ name: t.name, args: t.input })),
            });
            if (toolUses.length === 0) {
                events.emit({ type: "turn_end", turnId, stopReason: "end_turn" });
                await cfg.hooks?.afterTurn?.(turnIndex, totals);
                break;
            }
            const toolResults = await executeToolCalls(toolUses, cfg, events);
            const appended = appendToolResults(history, toolResults.map((r) => ({
                toolUseId: r.call.id,
                content: r.result.content,
                isError: r.result.isError,
            })));
            history.length = 0;
            history.push(...appended);
            events.emit({ type: "turn_end", turnId, stopReason: "tool_use" });
            await cfg.hooks?.afterTurn?.(turnIndex, totals);
        }
    }
    finally {
        events.emit({
            type: "agent_end",
            sessionId: cfg.sessionId,
            stopReason,
            usage: totals,
        });
    }
    return {
        messages: history,
        usage: totals,
        stopReason,
        turnCount,
        sessionId: cfg.sessionId,
    };
}
async function executeToolCalls(toolUses, cfg, events) {
    const run = async (call) => {
        let input = call.input;
        if (cfg.hooks?.beforeToolCall) {
            const decision = await cfg.hooks.beforeToolCall(call);
            if (decision?.block) {
                const result = { content: decision.reason, isError: true };
                return { call, result };
            }
            if (decision && !decision.block && decision.replaceInput !== undefined) {
                input = decision.replaceInput;
            }
        }
        if (cfg.approvalBus?.requiresApproval(call.name, input) &&
            !cfg.autoApprove) {
            const decision = await cfg.approvalBus.request({
                id: call.id,
                tool: call.name,
                summary: `${call.name}: ${truncateForSummary(input)}`,
            });
            if (decision === "deny" || decision === "deny_always") {
                return {
                    call,
                    result: {
                        content: `Tool call ${call.name} denied by user.`,
                        isError: true,
                    },
                };
            }
        }
        events.emit({
            type: "tool_exec_start",
            id: call.id,
            name: call.name,
            input,
        });
        const started = Date.now();
        let result;
        try {
            result = await cfg.toolExecutor.execute({ ...call, input }, cfg.signal ?? defaultSignal());
        }
        catch (err) {
            result = {
                content: `Tool execution failed: ${String(err)}`,
                isError: true,
            };
        }
        const durationMs = Date.now() - started;
        result =
            (await cfg.hooks?.afterToolCall?.({ ...call, input }, result)) ?? result;
        events.emit({
            type: "tool_exec_end",
            id: call.id,
            output: result.content,
            isError: result.isError,
            durationMs,
            ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
        });
        return { call: { ...call, input }, result };
    };
    if (cfg.toolConcurrency === "parallel" && toolUses.length > 1) {
        const results = await Promise.allSettled(toolUses.map(run));
        return results.map((r) => r.status === "fulfilled"
            ? r.value
            : {
                call: { id: "", name: "error", input: {} },
                result: {
                    content: `Tool execution failed: ${String(r.reason)}`,
                    isError: true,
                },
            });
    }
    const out = [];
    for (const u of toolUses)
        out.push(await run(u));
    return out;
}
function truncateForSummary(input, max = 160) {
    const s = typeof input === "string" ? input : JSON.stringify(input);
    return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
function defaultSignal() {
    return new AbortController().signal;
}
//# sourceMappingURL=agent-loop.js.map