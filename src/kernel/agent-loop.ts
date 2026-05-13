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

import type {
  Message,
  AgentEvent,
  AgentResult,
  ToolCall,
  ToolResult,
  ToolDefinition,
  UsageTotal,
  StopReason,
  Provider,
  ToolExecutor,
  ApprovalBus,
  ErrorClassifier,
  AgentHooks,
} from "./types.js";
import type { EventStream } from "./event-stream.js";
import { assembleTurn, extractToolUses, appendToolResults } from "./message.js";
import { resolveModelForDispatch } from "../providers/dispatch.js";
import { findFailover } from "../intelligence/prices.js";
import {
  recordFailover,
  isBlacklisted,
} from "../intelligence/failover-chain.js";
import { recordRequest, recordRateLimit } from "../providers/health.js";
import {
  recordSuccess as recordHealthSuccess,
  recordFailure as recordHealthFailure,
} from "../intelligence/health-monitor.js";
import { drainPending } from "../safety/audit-log.js";
import { pushAuditEntries } from "../telemetry/gateway-push.js";
import { loadToken } from "../integrations/device-auth.js";
import { raceSignals } from "./abort-utils.js";

export interface AgentLoopConfig {
  sessionId: string;
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxTurns: number;
  provider: Provider;
  toolExecutor: ToolExecutor;
  events: EventStream;
  approvalBus?: ApprovalBus;
  errorClassifier?: ErrorClassifier;
  hooks?: AgentHooks;
  contextTransform?: (messages: Message[]) => Promise<Message[]>;
  toolConcurrency?: "serial" | "parallel";
  signal?: AbortSignal;
  /**
   * When true, every approval-required tool call is auto-granted
   * without going through the ApprovalBus. Set by `dirgha --yolo` or
   * by the YOLO mode preamble. The ApprovalBus is otherwise the
   * canonical gate for risky operations (writes outside cwd, shell,
   * git mutations, etc.).
   */
  autoApprove?: boolean;
  costCalculator?: (input: number, output: number, cached: number) => number;
  /** Optional loop detector — checked before each turn; abort if looping. */
  loopDetector?: {
    track(turn: { toolCalls?: Array<{ name: string; args?: unknown }> }): void;
    isLoopDetected(): boolean;
    reason(): string | null;
  };
}

// ── History repair helpers ────────────────────────────────────────────────────
//
// Structural 400s (bad message sequence) cannot be fixed by retrying with the
// same history. These helpers implement progressive in-place repair so the
// session never dies from a malformed history.
//
// Call order on a 400:
//   Level 0 → 1: _sanitizeHistory   (targeted structural fixes)
//   Level 1 → 2: _stripAllToolTurns (remove all tool context, keep text)
//   Level 2 → 3: truncate to last 6 messages + system
//   Level 3+    : fall through to hard error

/** General structural sanitizer — fixes all message-sequence issues. */
function _sanitizeHistory(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (const msg of messages) {
    // Drop empty content
    if (Array.isArray(msg.content) && msg.content.length === 0) continue;
    if (typeof msg.content === "string" && msg.content.trim() === "") continue;

    const prev = result[result.length - 1];
    // Collapse consecutive same-role messages (merge content, skip system)
    if (prev && prev.role === msg.role && msg.role !== "system") {
      if (typeof prev.content === "string" && typeof msg.content === "string") {
        prev.content = prev.content + "\n" + msg.content;
      } else {
        const pc: import("./types.js").ContentPart[] =
          typeof prev.content === "string"
            ? [{ type: "text", text: prev.content }]
            : [...prev.content];
        const mc: import("./types.js").ContentPart[] =
          typeof msg.content === "string"
            ? [{ type: "text", text: msg.content }]
            : msg.content;
        prev.content = [...pc, ...mc];
      }
      continue;
    }

    result.push({
      ...msg,
      content: Array.isArray(msg.content) ? [...msg.content] : msg.content,
    });
  }

  // Strip assistant-all-tool_use blocks whose IDs have no matching tool_result
  for (let i = 0; i < result.length - 1; i++) {
    const msg = result[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const toolUses = msg.content.filter((p) => p.type === "tool_use") as Array<{ type: "tool_use"; id: string }>;
    if (toolUses.length === 0) continue;
    const next = result[i + 1];
    const nextContent = next && Array.isArray(next.content) ? next.content : [];
    const nextIds = new Set(
      nextContent
        .filter((p) => p.type === "tool_result")
        .map((p) => (p as { type: "tool_result"; toolUseId: string }).toolUseId),
    );
    // Remove orphaned tool_use blocks (IDs with no matching result); keep valid ones
    const orphanedUseIds = new Set(toolUses.filter((tu) => !nextIds.has(tu.id)).map((tu) => tu.id));
    if (orphanedUseIds.size > 0) {
      const kept = msg.content.filter(
        (p) => p.type !== "tool_use" || !orphanedUseIds.has((p as { type: "tool_use"; id: string }).id),
      );
      if (kept.length === 0) { result.splice(i, 1); i--; }
      else msg.content = kept;
    }
  }

  // Strip tool_result blocks in user messages whose toolUseId has no matching tool_use in prev
  for (let i = 1; i < result.length; i++) {
    const msg = result[i];
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    const toolResults = msg.content.filter((p) => p.type === "tool_result") as Array<{ type: "tool_result"; toolUseId: string }>;
    if (toolResults.length === 0) continue;
    const prev = result[i - 1];
    const prevUses = (prev && Array.isArray(prev.content) ? prev.content : []).filter(
      (p) => p.type === "tool_use",
    ) as Array<{ type: "tool_use"; id: string }>;
    const validIds = new Set(prevUses.map((tu) => tu.id));
    // Remove only the orphaned result blocks (not the whole message)
    const orphanedResultIds = new Set(toolResults.filter((tr) => !validIds.has(tr.toolUseId)).map((tr) => tr.toolUseId));
    if (orphanedResultIds.size > 0) {
      const kept = msg.content.filter(
        (p) => p.type !== "tool_result" || !orphanedResultIds.has((p as { type: "tool_result"; toolUseId: string }).toolUseId),
      );
      if (kept.length === 0) { result.splice(i, 1); i--; }
      else msg.content = kept;
    }
  }

  return result;
}

/** Nuclear fallback: remove all tool_use/tool_result content, keep text/thinking. */
function _stripAllToolTurns(messages: Message[]): Message[] {
  const stripped = messages
    .map((msg): Message | null => {
      if (typeof msg.content === "string") return msg;
      if (msg.role === "user") {
        const nonTool = msg.content.filter((p) => p.type !== "tool_result");
        if (nonTool.length === 0) return null;
        return { ...msg, content: nonTool };
      }
      if (msg.role === "assistant") {
        const nonTool = msg.content.filter((p) => p.type !== "tool_use");
        if (nonTool.length === 0) return null;
        return { ...msg, content: nonTool };
      }
      return msg;
    })
    .filter((m): m is Message => m !== null);
  return _sanitizeHistory(stripped);
}

// Remove any user messages containing only tool_result parts that are not
// immediately preceded by an assistant message with tool_use parts.
// contextTransform (compaction/summarization) can produce these by collapsing
// assistant turns that called tools, leaving the result messages orphaned.
// Sending orphaned tool_result messages triggers HTTP 400 from the provider.
function _stripOrphanedToolResults(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (const msg of messages) {
    if (
      msg.role === "user" &&
      Array.isArray(msg.content) &&
      msg.content.length > 0 &&
      msg.content.every((p) => (p as { type: string }).type === "tool_result")
    ) {
      const prev = out[out.length - 1];
      if (
        prev?.role === "assistant" &&
        Array.isArray(prev.content) &&
        (prev.content as Array<{ type: string }>).some(
          (p) => p.type === "tool_use",
        )
      ) {
        out.push(msg);
      }
      // else: drop orphaned tool_result message — no matching tool_use above it
    } else {
      out.push(msg);
    }
  }
  return out;
}

export async function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentResult> {
  const events = cfg.events;
  const history: Message[] = [...cfg.messages];
  const totals: UsageTotal = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: 0,
  };
  const loopController = new AbortController();
  const signal = cfg.signal ?? loopController.signal;
  cfg.signal = signal;
  const maxTurns = Math.max(1, Math.min(1000, cfg.maxTurns));
  let stopReason: StopReason = "end_turn";
  let turnCount = 0;
  let retriesForTurn = 0;
  let _compactedThisTurn = false; // guards against infinite compact→retry→compact loops
  let _historyRepairLevel = 0;   // 0=clean, 1=sanitized, 2=tool-stripped, 3=truncated
  const DEFAULT_MAX_RETRIES = 3;
  // Per-reason caps override the default. TTFT timeouts have already
  // waited 90 s — retrying once is sufficient evidence the provider is
  // wedged; burning 3× retries wastes ~4.5 min for no benefit.
  const PER_REASON_MAX_RETRIES: Record<string, number> = {
    timeout: 1,
    rate_limit: 1,
  };

  events.emit({
    type: "agent_start",
    sessionId: cfg.sessionId,
    model: cfg.model,
  });

  try {
    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
      if (signal.aborted) {
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

      // Self-healing: if the model has been blacklisted after too many
      // consecutive failovers, surface the failover so the TUI/caller
      // can prompt the user to switch. The loop itself continues with
      // the current model (callers swap between runAgentLoop calls).
      if (turnIndex === 0 && isBlacklisted(cfg.model)) {
        const fallback = findFailover(cfg.model);
        events.emit({
          type: "error",
          message: `Model "${cfg.model}" is blacklisted after repeated failures`,
          reason: "failover",
          retryable: false,
          ...(fallback ? { failoverModel: fallback } : {}),
        });
      }

      turnCount = turnIndex + 1;
      const turnId = `t${turnIndex}-${Date.now().toString(36)}`;

      // Reset per-turn: each turn starts with a fresh compaction attempt budget
      _compactedThisTurn = false;

      let messagesForCall: Message[];
      try {
        messagesForCall = cfg.contextTransform
          ? await cfg.contextTransform(history)
          : history;
      } catch (err) {
        stopReason = "error";
        events.emit({
          type: "error",
          message: `contextTransform failed: ${err instanceof Error ? err.message : String(err)}`,
          retryable: false,
        });
        events.emit({ type: "turn_end", turnId, stopReason });
        break;
      }

      // Full-history scan: remove any orphaned tool_result messages that
      // contextTransform may have introduced mid-history (not just tail).
      messagesForCall = _stripOrphanedToolResults(messagesForCall);

      const streamEvents: AgentEvent[] = [];
      try {
        const dispatchModel = resolveModelForDispatch(cfg.model);
        for await (const ev of cfg.provider.stream({
          model: dispatchModel,
          messages: messagesForCall,
          tools: cfg.tools,
          signal: signal,
        })) {
          streamEvents.push(ev);
          events.emit(ev);
          if (signal.aborted) break;
        }
      } catch (err) {
        // An AbortError mid-stream is a clean cancellation, not a
        // failure. Distinguish so callers (and `dirgha audit`) see
        // `stopReason: 'aborted'` instead of misleading 'error'.
        const isAbort =
          (err instanceof Error &&
            (err.name === "AbortError" ||
              /aborted|abort/i.test(err.message))) ||
          signal.aborted;
        if (isAbort) {
          stopReason = "aborted";
          recordRequest(cfg.provider.id, false, 0);
          events.emit({ type: "turn_end", turnId, stopReason });
          break;
        }
        const classified = cfg.errorClassifier?.classify(
          err,
          cfg.provider.id,
          cfg.model,
        );
        recordRequest(cfg.provider.id, false, 0);
        if (classified?.reason === "rate_limit")
          recordRateLimit(cfg.provider.id);
        // Suggest a known-good fallback model so the TUI can prompt the
        // user to switch instead of just dead-ending the turn. Only
        // fires for errors that look fixable by swapping models —
        // bad-id (400 "not a valid model"), deprecated, rate-limit,
        // or 5xx upstream failures.
        const errMsg = err instanceof Error ? err.message : String(err);
        recordHealthFailure(cfg.provider.id, errMsg);

        // ── Auto-compaction on context-length errors ──────────────────────
        // When the provider says the conversation exceeds the model's context
        // window, we compact the history (summarise older turns) and retry
        // transparently. No prompt, no failover — the user never sees it.
        // If compaction was already attempted this turn, fall through to failover.
        const contextLenRe =
          /context.?length|too long|maximum.*length|max.*tokens|token.?limit|context_length_exceeded|Message too long|string too long/i;
        if (contextLenRe.test(errMsg)) {
          if (cfg.contextTransform && !_compactedThisTurn) {
            _compactedThisTurn = true;
            try {
              const compacted = await cfg.contextTransform(history);
              // Mutate history in-place — const prevents reassignment
              history.length = 0;
              history.push(...compacted);
              turnIndex--;
              continue;
            } catch {
              // Compaction itself failed — fall through to normal error path
            }
          }
          // Eager retry flag: suppress the failover prompt and just retry
          // with the compacted history one more time
          if (_compactedThisTurn) {
            await new Promise((r) => setTimeout(r, 1000));
            turnIndex--;
            continue;
          }
        }

        // ── Structural 400 recovery — progressive history repair ─────────────
        // When a provider rejects our message sequence (bad tool ordering,
        // orphaned results, consecutive same-role, etc.) retrying with the
        // same broken history will fail identically. Instead, escalate through
        // three repair levels so the session never dies from a bad history.
        const is400Structural =
          /\b400\b|bad.?request|invalid.*message|tool.*role|messages.*tool|tool_result.*tool_use/i.test(
            errMsg,
          ) &&
          !/context.?length|too long|max.*tokens|context_length_exceeded/i.test(
            errMsg,
          );
        if (is400Structural && _historyRepairLevel < 3) {
          // Helper: after any repair, ensure history is never empty.
          // An empty messages array will fail with a different error; keep at
          // minimum the system messages, or the last user message as a fallback.
          const ensureNonEmpty = (msgs: Message[]): Message[] => {
            if (msgs.length > 0) return msgs;
            const sys = history.filter((m) => m.role === "system");
            if (sys.length > 0) return sys;
            const lastUser = [...history].reverse().find((m) => m.role === "user");
            return lastUser ? [lastUser] : history.slice(-1);
          };
          if (_historyRepairLevel === 0) {
            _historyRepairLevel = 1;
            const repaired = ensureNonEmpty(_sanitizeHistory(history));
            history.length = 0;
            history.push(...repaired);
          } else if (_historyRepairLevel === 1) {
            _historyRepairLevel = 2;
            const stripped = ensureNonEmpty(_stripAllToolTurns(history));
            history.length = 0;
            history.push(...stripped);
            events.emit({
              type: "error",
              message:
                "Tool history stripped due to repeated API errors — continuing with text context only.",
              retryable: true,
            });
          } else if (_historyRepairLevel === 2) {
            _historyRepairLevel = 3;
            const system = history.filter((m) => m.role === "system");
            const recent = history.filter((m) => m.role !== "system").slice(-6);
            const truncated = ensureNonEmpty([...system, ...recent]);
            history.length = 0;
            history.push(...truncated);
            events.emit({
              type: "error",
              message:
                "Context reset due to persistent API errors — conversation restarted from recent history.",
              retryable: true,
            });
          }
          turnIndex--;
          continue;
        }

        // Known limitation: this regex is fragile — provider error messages
        // can change at any time. A classifier or structured error code is
        // the correct long-term fix, but that requires per-provider parsing.
        const looksFixable =
          /not a valid model id|deprecated|model_not_found|rate.?limit|429\b|5\d\d\b|bad.?gateway|upstream/i.test(
            errMsg,
          );
        const failover = looksFixable ? findFailover(cfg.model) : undefined;
        if (looksFixable) {
          recordFailover(cfg.model);
        }
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

        const reasonMaxRetries =
          PER_REASON_MAX_RETRIES[classified?.reason ?? ""] ??
          DEFAULT_MAX_RETRIES;
        if (
          classified?.retryable &&
          retriesForTurn < reasonMaxRetries
        ) {
          retriesForTurn++;
          const backoff = classified.backoffMs ?? 1000;
          await new Promise((r) => setTimeout(r, backoff));
          // Bug 5 fix: decrement turnIndex before continue so the for-loop's
          // post-increment restores it to the same value. Without this, every
          // retry consumed a turn budget slot — with maxTurns=3 and 3 retries
          // on turn 0, the loop exited before any real agent work happened.
          turnIndex--;
          continue;
        }

        stopReason = "error";
        events.emit({ type: "turn_end", turnId, stopReason });
        break;
      }

      // Abort via signal.aborted break (not thrown AbortError): treat identically.
      if (signal.aborted) {
        stopReason = "aborted";
        events.emit({ type: "turn_end", turnId, stopReason });
        break;
      }

      const assembled = assembleTurn(streamEvents);
      totals.inputTokens += assembled.inputTokens;
      totals.outputTokens += assembled.outputTokens;
      totals.cachedTokens += assembled.cachedTokens;
      recordRequest(cfg.provider.id, true, 0);
      recordHealthSuccess(cfg.provider.id, 0);
      retriesForTurn = 0;
      _historyRepairLevel = 0; // reset repair level after a clean successful turn
      if (cfg.costCalculator) {
        totals.costUsd += cfg.costCalculator(
          assembled.inputTokens,
          assembled.outputTokens,
          assembled.cachedTokens,
        );
      }
      const toolUses = extractToolUses(assembled.message);
      // Always push the assistant message when there are tool calls — the
      // provider requires tool results to follow an assistant message with
      // tool_calls. For pure-text turns with no content, skip to avoid
      // sending content:[] which some providers also reject.
      const parts = Array.isArray(assembled.message.content)
        ? assembled.message.content
        : [];
      if (parts.length > 0 || toolUses.length > 0) {
        history.push(assembled.message);
      }
      try {
        cfg.loopDetector?.track({
          toolCalls: toolUses.map((t) => ({ name: t.name, args: t.input })),
        });
      } catch {
        // loopDetector.track may throw with malformed tool inputs;
        // don't let it poison history — treat as no tools and exit.
        console.error(
          `[agent-loop] loopDetector.track failed for session ${cfg.sessionId}`,
        );
        events.emit({ type: "turn_end", turnId, stopReason: "end_turn" });
        break;
      }
      if (toolUses.length === 0) {
        if (turnIndex >= maxTurns - 1) stopReason = "max_turns";
        events.emit({ type: "turn_end", turnId, stopReason: "end_turn" });
        try {
          await cfg.hooks?.afterTurn?.(turnIndex, totals);
        } catch {}
        void flushAuditEntries(cfg.sessionId);
        break;
      }

      const toolResults = await executeToolCalls(toolUses, cfg, events);
      const appended = appendToolResults(
        history,
        toolResults.map((r) => ({
          toolUseId: r.call.id,
          content: r.result.content,
          isError: r.result.isError,
        })),
      );
      history.length = 0;
      history.push(...appended);

      // Defensive: ensure history ends with a valid sequence for the next
      // turn. If tool results were appended without a preceding assistant
      // message carrying tool_calls (e.g. due to a provider or compaction
      // anomaly), the next API call would get orphaned role:"tool" /
      // role:"user" tool_result messages and trigger HTTP 400.
      // Strip any dangling tool-result messages that lack a prior assistant
      // message with tool_use parts.
      while (history.length > 0) {
        const last = history[history.length - 1];
        const hasToolResults =
          Array.isArray(last.content) &&
          last.content.some((p) => p.type === "tool_result");
        if (!hasToolResults) break;
        // Check if the message before this one is an assistant with tool_use
        if (history.length >= 2) {
          const prev = history[history.length - 2];
          if (
            prev.role === "assistant" &&
            Array.isArray(prev.content) &&
            prev.content.some((p) => p.type === "tool_use")
          ) {
            break; // valid sequence
          }
        }
        // Dangling tool result — remove it to avoid HTTP 400
        history.pop();
      }

      events.emit({ type: "turn_end", turnId, stopReason: "tool_use" });
      try {
        await cfg.hooks?.afterTurn?.(turnIndex, totals);
      } catch {}
      void flushAuditEntries(cfg.sessionId);
    }
  } finally {
    loopController.abort();
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

async function executeToolCalls(
  toolUses: ToolCall[],
  cfg: AgentLoopConfig,
  events: EventStream,
): Promise<Array<{ call: ToolCall; result: ToolResult }>> {
  const run = async (
    call: ToolCall,
  ): Promise<{ call: ToolCall; result: ToolResult }> => {
    let input = call.input;
    if (cfg.hooks?.beforeToolCall) {
      try {
        const decision = await cfg.hooks.beforeToolCall(call);
        if (decision?.block) {
          const blockReason =
            decision.reason ??
            `Tool '${call.name}' is not allowed in current mode.`;
          const result: ToolResult = {
            content: `[MODE BLOCK] ${blockReason}`,
            isError: true,
          };
          // Emit start so the projection has an item to transition to
          // "blocked" state. Without this, tool_exec_end maps over nothing.
          events.emit({
            type: "tool_exec_start",
            id: call.id,
            name: call.name,
            input: call.input,
          });
          events.emit({
            type: "tool_exec_end",
            id: call.id,
            output: result.content,
            isError: true,
            durationMs: 0,
          });
          return { call, result };
        }
        if (
          decision &&
          !decision.block &&
          decision.replaceInput !== undefined
        ) {
          input = decision.replaceInput;
        }
      } catch (hookErr) {
        const result: ToolResult = {
          content: `Hook error: ${hookErr instanceof Error ? hookErr.message : String(hookErr)}`,
          isError: true,
        };
        return { call, result };
      }
    }
    if (
      cfg.approvalBus?.requiresApproval(call.name, input) &&
      !cfg.autoApprove
    ) {
      // Race against abort so Esc while an approval prompt is showing
      // doesn't leave the TUI frozen with busy=true forever.
      const decision = await Promise.race([
        cfg.approvalBus.request({
          id: call.id,
          tool: call.name,
          summary: `${call.name}: ${truncateForSummary(input)}`,
        }),
        new Promise<"deny">((res) => {
          if (cfg.signal?.aborted) {
            res("deny");
            return;
          }
          cfg.signal?.addEventListener("abort", () => res("deny"), {
            once: true,
          });
        }),
      ]);
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

    const toolTimeoutMs = 300_000;
    const toolTimeoutCtrl = new AbortController();
    const toolTimer = setTimeout(() => toolTimeoutCtrl.abort(), toolTimeoutMs);
    const { signal: toolSignal, cancel: cancelToolRace } = raceSignals(
      cfg.signal!,
      toolTimeoutCtrl.signal,
    );

    const started = Date.now();
    let result: ToolResult;
    try {
      result = await cfg.toolExecutor.execute({ ...call, input }, toolSignal);
    } catch (err) {
      if (toolTimeoutCtrl.signal.aborted) {
        result = {
          content: "[TIMEOUT] Tool exceeded 300s",
          isError: true,
        };
      } else {
        result = {
          content: `Tool execution failed: ${String(err)}`,
          isError: true,
        };
      }
    } finally {
      clearTimeout(toolTimer);
      cancelToolRace();
    }

    const durationMs = Date.now() - started;
    let afterResult: ToolResult = result!;
    try {
      afterResult =
        (await cfg.hooks?.afterToolCall?.({ ...call, input }, result!)) ??
        result!;
    } catch (hookErr) {
      // afterToolCall hook errors must not crash the agent loop — treat as
      // a no-op and continue with the original result.
      console.error(
        `[agent-loop] afterToolCall hook threw for tool ${call.name}:`,
        hookErr,
      );
    }
    result = afterResult;
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
    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            // Preserve original call so toolUseId in the next API message is non-empty.
            call: toolUses[i]!,
            result: {
              content: `Tool execution failed: ${String(r.reason)}`,
              isError: true,
            },
          },
    );
  }
  const out: Array<{ call: ToolCall; result: ToolResult }> = [];
  for (const u of toolUses) out.push(await run(u));
  return out;
}

/**
 * Drain pending audit entries and push them to the gateway.
 * Fully fire-and-forget — never throws, never blocks the hot path.
 * Token is loaded lazily per flush so we don't cache a stale JWT.
 */
async function flushAuditEntries(sessionId: string): Promise<void> {
  try {
    const entries = await drainPending();
    if (entries.length === 0) return;
    const tok = await loadToken();
    if (!tok) return; // not logged in — skip silently
    await pushAuditEntries(sessionId, entries, tok.token);
  } catch {
    // Telemetry must never crash the CLI.
  }
}

function truncateForSummary(input: unknown, max = 160): string {
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    s = String(input);
  }
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}
