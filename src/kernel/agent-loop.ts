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
import type { Session } from "../context/session.js";
import { assembleTurn, extractToolUses, appendToolResults } from "./message.js";
import { resolveModelForDispatch } from "../providers/dispatch.js";
import { findFailover } from "../intelligence/prices.js";
import {
  recordFailover,
} from "../intelligence/failover-chain.js";
import { recordRequest, recordRateLimit } from "../providers/health.js";
import {
  recordSuccess as recordHealthSuccess,
  recordFailure as recordHealthFailure,
  isBlacklisted,
} from "../intelligence/health-monitor.js";
import { drainPending } from "../safety/audit-log.js";
import { pushAuditEntries } from "../telemetry/gateway-push.js";
import { loadToken } from "../integrations/device-auth.js";
import { raceSignals } from "./abort-utils.js";
import { isJsonParseFailure } from "../utils/json-repair.js";
import { StableLoopGuard } from '../subagents/loop-guard.js';

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
  /**
   * Maximum milliseconds to wait for the provider to begin streaming a
   * response (TTFB timeout). Defaults to 180_000 (3 min). If the provider
   * doesn't send the first event within this window, the turn is retried
   * (up to the per-reason retry cap for "timeout"). Set to 0 for no limit.
   */
  streamTtfbTimeoutMs?: number;
  /**
   * Maximum milliseconds for the entire model stream per turn, from first
   * byte to completion. Defaults to 300_000 (5 min). Protects against
   * provider hangs that never send a terminal event. Set to 0 for no limit.
   */
  streamTimeoutMs?: number;
  /** Token limit for the model's context window. Defaults to 128_000. Used for proactive compaction before the limit is hit. */
  contextLimit?: number;
  /** Optional loop detector — checked before each turn; abort if looping. */
  loopDetector?: {
    track(turn: { toolCalls?: Array<{ name: string; args?: unknown }>; message?: Message }): void;
    isLoopDetected(): boolean;
    reason(): string | null;
  };
  /**
   * Optional session for per-turn crash-safe checkpointing. When provided,
   * each assistant message and each batch of tool results is appended to the
   * session immediately after it is produced, rather than waiting for the
   * caller to flush everything at the end of runAgentLoop.
   */
  session?: Session;
}

// ── History repair helpers ────────────────────────────────────────────────────
//
// Structural 400s (bad message sequence) cannot be fixed by retrying with the
// same history. These helpers implement progressive in-place repair so the
// session never dies from a malformed history.
//
// Call order on a 400:
//   Level 0 → 1: _sanitizeHistory + first pass                  (targeted structural fixes)
//   Level 1 → 2: _sanitizeHistory + _stripOrphanedToolResults   (orphan cleanup, free)
//   Level 2 → 3: _stripAllToolTurns                             (remove all tool context)
//   Level 3 → 4: truncate to last 6 messages + system
//   Level 4+    : fall through to hard error

/** General structural sanitizer — fixes all message-sequence issues. */
function _sanitizeHistory(messages: Message[]): Message[] {
  return _hardenHistory(messages);
}

/**
 * Multi-pass history hardening (5 passes, matching Gemini CLI production patterns).
 *
 * Pass 1 — Coalesce: merge adjacent same-role messages, drop empty content.
 * Pass 2 — Tool pairing: inject sentinel tool_results for orphaned tool_use blocks.
 * Pass 3 — Role constraints: history must start with "user"; prepend synthetic if not.
 * Pass 4 — Strip orphaned tool_results (calls _stripOrphanedToolResults).
 * Pass 5 — Drop empty messages (covered in Pass 1 coalesce).
 */
function _hardenHistory(messages: Message[]): Message[] {
  // ── Pass 1: Coalesce ─────────────────────────────────────────────────────────
  const pass1: Message[] = [];
  for (const msg of messages) {
    // Drop empty content (Pass 1 + Pass 5)
    if (Array.isArray(msg.content) && msg.content.length === 0) continue;
    if (typeof msg.content === "string" && msg.content.trim() === "") continue;

    const prev = pass1[pass1.length - 1];
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

    pass1.push({
      ...msg,
      content: Array.isArray(msg.content) ? [...msg.content] : msg.content,
    });
  }

  // ── Pass 2: Tool pairing ─────────────────────────────────────────────────────
  // For every assistant message with tool_use parts, ensure the following user
  // message has matching tool_result parts. Missing results get a sentinel.
  const pass2: Message[] = [];
  for (let i = 0; i < pass1.length; i++) {
    const msg = pass1[i];
    pass2.push(msg);

    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const toolUses = msg.content.filter((p) => p.type === "tool_use") as Array<{
      type: "tool_use";
      id: string;
    }>;
    if (toolUses.length === 0) continue;

    const next = pass1[i + 1];
    const nextContent =
      next?.role === "user" && Array.isArray(next.content) ? next.content : [];
    const existingResultIds = new Set(
      nextContent
        .filter((p) => p.type === "tool_result")
        .map(
          (p) =>
            (p as { type: "tool_result"; toolUseId: string }).toolUseId,
        ),
    );

    // Find tool_use IDs that have no matching result
    const missingIds = toolUses
      .map((tu) => tu.id)
      .filter((id) => !existingResultIds.has(id));

    if (missingIds.length === 0) continue;

    const sentinelParts = missingIds.map((id) => ({
      type: "tool_result" as const,
      toolUseId: id,
      content:
        "[System: tool result lost due to context management]",
      isError: true as const,
    }));

    if (next?.role === "user") {
      // Merge sentinels into the existing user message regardless of whether
      // its content is a string or array. Converting string → array is valid
      // API format and prevents two consecutive user messages (which cause 400).
      const existingParts: import("./types.js").ContentPart[] =
        typeof next.content === "string"
          ? [{ type: "text" as const, text: next.content }]
          : Array.isArray(next.content)
            ? [...next.content]
            : [];
      pass1[i + 1] = {
        ...next,
        content: [...sentinelParts, ...existingParts],
      };
    } else {
      // No following user message at all — inject a synthetic one
      const syntheticUser: Message = {
        role: "user",
        content: sentinelParts,
      };
      pass2.push(syntheticUser);
    }
  }

  // ── Pass 2b: Re-coalesce after sentinel injection ─────────────────────────
  // A second coalesce pass catches any consecutive user messages that may
  // survive Pass 2 injection in edge cases.
  const pass2b: Message[] = [];
  for (const msg of pass2) {
    if (Array.isArray(msg.content) && msg.content.length === 0) continue;
    if (typeof msg.content === "string" && msg.content.trim() === "") continue;
    const prev = pass2b[pass2b.length - 1];
    if (prev && prev.role === msg.role && msg.role !== "system") {
      const pc: import("./types.js").ContentPart[] =
        typeof prev.content === "string"
          ? [{ type: "text", text: prev.content }]
          : [...prev.content];
      const mc: import("./types.js").ContentPart[] =
        typeof msg.content === "string"
          ? [{ type: "text", text: msg.content }]
          : msg.content;
      prev.content = [...pc, ...mc];
      continue;
    }
    pass2b.push({ ...msg, content: Array.isArray(msg.content) ? [...msg.content] : msg.content });
  }

  // ── Pass 3: Role constraints ─────────────────────────────────────────────────
  // History must start with "user". If first non-system message is "assistant",
  // prepend a synthetic user message.
  const firstNonSystem = pass2b.findIndex((m) => m.role !== "system");
  if (firstNonSystem !== -1 && pass2b[firstNonSystem].role === "assistant") {
    pass2b.splice(firstNonSystem, 0, {
      role: "user" as const,
      content: "[System: conversation resumed]",
    });
  }

  // ── Pass 4: Strip orphaned tool_results ──────────────────────────────────────
  const pass4 = _stripOrphanedToolResults(pass2b);

  // ── Pass 5: Drop remaining empty messages (safety net) ───────────────────────
  return pass4.filter((m) => {
    if (Array.isArray(m.content) && m.content.length === 0) return false;
    if (typeof m.content === "string" && m.content.trim() === "") return false;
    return true;
  });
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

/**
 * Remove orphaned tool_result parts from user messages.
 * For messages whose content is entirely tool_result parts, the message is
 * dropped if the immediately preceding assistant message does not contain a
 * matching tool_use (same id). For mixed-content messages (some tool_result,
 * some other parts), only the orphaned tool_result parts are removed; the
 * remaining parts are kept. If after filtering the content becomes empty,
 * the message is dropped.
 * contextTransform (compaction/summarization) can produce these by collapsing
 * assistant turns that called tools, leaving the result messages orphaned.
 * Sending orphaned tool_result messages triggers HTTP 400 from the provider.
 */
function _stripOrphanedToolResults(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (const msg of messages) {
    if (
      msg.role === "user" &&
      Array.isArray(msg.content) &&
      msg.content.length > 0
    ) {
      const toolResultParts = msg.content.filter(
        (p) => (p as { type: string }).type === "tool_result"
      );
      const nonToolParts = msg.content.filter(
        (p) => (p as { type: string }).type !== "tool_result"
      );
      if (toolResultParts.length === 0) {
        // No tool_result parts — keep as is
        out.push(msg);
      } else if (nonToolParts.length === 0) {
        // Pure tool_result message: check that at least one tool_result
        // has a matching tool_use id in the most recent assistant with
        // tool_use parts. Walk backwards through `out` (the already-
        // stripped projection) so compaction-dropped assistants are
        // correctly recognised as missing.
        const matchingToolUseIds = new Set<string>();
        for (let j = out.length - 1; j >= 0; j -= 1) {
          const candidate = out[j];
          if (candidate.role === "assistant" && Array.isArray(candidate.content)) {
            for (const part of candidate.content) {
              const p = part as { type: string; id?: string };
              if (p.type === "tool_use" && typeof p.id === "string") {
                matchingToolUseIds.add(p.id);
              }
            }
            if (matchingToolUseIds.size > 0) break;
          }
        }
        const hasMatchingResult = msg.content.some((p) => {
          const tr = p as { type: string; toolUseId?: string };
          return tr.type === "tool_result" && typeof tr.toolUseId === "string" && matchingToolUseIds.has(tr.toolUseId);
        });
        if (hasMatchingResult) {
          out.push(msg);
        }
        // else: drop orphan — no matching tool_use id found in prior out
      } else {
        // Mixed content: filter out orphaned tool_result parts
        const prev = out[out.length - 1];
        const matchingToolUseIds = new Set<string>();
        if (
          prev?.role === "assistant" &&
          Array.isArray(prev.content)
        ) {
          for (const part of prev.content) {
            const p = part as { type: string; id?: string };
            if (p.type === "tool_use" && p.id) {
              matchingToolUseIds.add(p.id);
            }
          }
        }
        const newContent = msg.content.filter((p) => {
          const part = p as { type: string; toolUseId?: string };
          if (part.type !== "tool_result") return true;
          return part.toolUseId != null && matchingToolUseIds.has(part.toolUseId);
        });
        if (newContent.length > 0) {
          out.push({ ...msg, content: newContent });
        }
        // else: drop if nothing remains
      }
    } else {
      out.push(msg);
    }
  }
  return out;
}

/**
 * Last-resort recovery when all messages were stripped as orphaned.
 * Returns the minimum valid context: system messages + last user text message.
 * Never returns an empty array.
 */
function _recoverMinimalContext(history: Message[]): Message[] {
  const sys = history.filter((m) => m.role === "system");
  // Find last user message that has actual text content (not just tool_results)
  const lastTextUser = [...history].reverse().find(
    (m) =>
      m.role === "user" &&
      (typeof m.content === "string"
        ? m.content.trim().length > 0
        : (m.content as import("./types.js").ContentPart[]).some(
            (p) => p.type === "text" && (p as { type: "text"; text: string }).text.trim().length > 0,
          )),
  );
  if (lastTextUser) return [...sys, lastTextUser];
  // Return only system messages; caller must handle the case of no user message.
  return sys.length > 0 ? sys : [];
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
  let _lastCompactionTurnIndex = -Infinity;
  let _historyRepairLevel = 0;   // 0=clean, 1=sanitized, 2=tool-stripped, 3=truncated
  // Unified loop guard observes every (call, result) pair. Replaces the
  // previous dual mechanism of REFUSAL_ABORT_THRESHOLD + content-prefix
  // dedupe. The guard internally tracks four patterns: repeated tool
  // calls, identical refusals, identical refusal content, and output
  // stagnation across turns. Reset between prompts by callers.
  const _localLoopGuard = new StableLoopGuard({
    maxRepeatedToolCalls: 5,
    maxTurnsWithoutProgress: 3,
    maxIdenticalRefusals: 2,
    maxIdenticalContentRepeats: 2,
  });
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
        try {
          const decision = await cfg.hooks.beforeTurn(turnIndex, history);
          if (decision === "abort") {
            stopReason = "aborted";
            break;
          }
        } catch {
          /* beforeTurn hook errors must not crash the agent loop */
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
      if (turnIndex === 0 && isBlacklisted(cfg.provider.id, cfg.model)) {
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
      events.emit({ type: "turn_start", turnId, turnIndex });

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
      // Sanitise: run the 5-pass hardener to catch empty assistant messages,
      // orphaned tool_use parts, and other structural issues that compaction
      // can produce (e.g. assistant with content=[] and no tool_calls).
      // This prevents "Invalid assistant message: content or tool_calls must
      // be set" HTTP 400 errors from reaching the provider.
      messagesForCall = _sanitizeHistory(messagesForCall);
      // Guard: _stripOrphanedToolResults can return [] when all messages were orphaned.
      // If so, attempt to recover minimal context. Then check if the context is still
      // missing a user message — if we have only system messages, the conversation
      // cannot proceed.
      if (messagesForCall.length === 0) {
        messagesForCall = _recoverMinimalContext(history);
      }
      const _systemCount = messagesForCall.filter(m => m.role === 'system').length;
      if (messagesForCall.length === 0 || messagesForCall.length === _systemCount) {
        events.emit({
          type: "error",
          message: "Conversation context was lost and could not be recovered. Use /resume <sessionId> or start a new turn.",
          reason: "context_unrecoverable",
          retryable: false,
        });
        stopReason = "error";
        events.emit({ type: "turn_end", turnId, stopReason });
        break;
      }

      // ── Proactive compaction ──────────────────────────────────────────────
      // Fire before the API call when token usage is ≥80% of the context
      // limit — prevents silent degradation when providers don't return an
      // explicit context-length error (e.g. DeepSeek silently truncates).
      const estimateMessageTokens = (m: Message): number => {
        if (typeof m.content === 'string') return Math.ceil(m.content.length / 4);
        if (Array.isArray(m.content)) {
          return Math.ceil(m.content.reduce((s, p) => {
            if ((p as { type: string }).type === 'text') return s + ((p as { text?: string }).text?.length ?? 0);
            if ((p as { type: string }).type === 'tool_use') return s + JSON.stringify((p as { input?: unknown }).input ?? {}).length;
            if ((p as { type: string }).type === 'tool_result') return s + (((p as { content?: string }).content ?? '').length);
            return s + 0;
          }, 0) / 4);
        }
        return 0;
      };
      const historyTokens = history.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
      const _contextLimit = cfg.contextLimit ?? 128_000;
      if (
        _contextLimit > 0 &&
        historyTokens > _contextLimit * 0.8 &&
        cfg.contextTransform &&
        !_compactedThisTurn &&
        turnIndex - _lastCompactionTurnIndex >= 3
      ) {
        _compactedThisTurn = true;
        try {
          const compacted = await cfg.contextTransform(history);
          // Persist a compaction marker so future replays can skip pre-compaction
          // messages. keptFrom is the timestamp of the first message that
          // SURVIVED compaction (or now() if the compacted history is empty).
          // Best-effort: don't block compaction on session write.
          if (cfg.session) {
            const keptFrom = new Date().toISOString();
            const droppedCount = history.length - compacted.length;
            void cfg.session.append({
              type: 'compaction',
              ts: keptFrom,
              keptFrom,
              summary: `auto-compaction at turn ${turnIndex}: dropped ${droppedCount} message(s)`,
            });
            // Snapshot the post-compaction history so future session opens
            // can fast-load without scanning the full JSONL.
            void cfg.session.writeSnapshot(compacted);
          }
          history.length = 0;
          history.push(...compacted);
          messagesForCall = await cfg.contextTransform(history);
          messagesForCall = _stripOrphanedToolResults(messagesForCall);
          messagesForCall = _sanitizeHistory(messagesForCall);
          if (messagesForCall.length === 0) {
            messagesForCall = _recoverMinimalContext(history);
          }
          const _systemCount2 = messagesForCall.filter(m => m.role === 'system').length;
          if (messagesForCall.length === 0 || messagesForCall.length === _systemCount2) {
            events.emit({
              type: "error",
              message: "Conversation context was lost and could not be recovered. Use /resume <sessionId> or start a new turn.",
              reason: "context_unrecoverable",
              retryable: false,
            });
            stopReason = "error";
            events.emit({ type: "turn_end", turnId, stopReason });
            break;
          }
          // Compute post-compaction tokens to decide cooldown
          const newHistoryTokens = history.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
          if (newHistoryTokens >= historyTokens) {
            // Tokens did not decrease — longer cooldown
            _lastCompactionTurnIndex = turnIndex + 7;
          } else {
            _lastCompactionTurnIndex = turnIndex;
          }
        } catch {
          // Compaction failed — continue with original messages
        }
      }

      const streamEvents: AgentEvent[] = [];
      // Per-turn stream timeout: protects against provider hangs that
      // never send a terminal event. The loop signal (user Esc) still
      // takes precedence — a timeout fires only when the loop is not
      // already aborted. Uses the same raceSignals pattern as the tool
      // timeout for consistent cleanup.
      const streamTimeoutMs = cfg.streamTimeoutMs ?? 300_000;
      const streamCtrl = new AbortController();
      const streamTimer = streamTimeoutMs > 0
        ? setTimeout(() => { if (!signal.aborted) streamCtrl.abort(); }, streamTimeoutMs)
        : null;
      const { signal: streamSignal, cancel: cancelStreamRace } = streamTimeoutMs > 0
        ? raceSignals(signal, streamCtrl.signal)
        : { signal, cancel: () => {} };
      try {
        const dispatchModel = resolveModelForDispatch(cfg.model);
        for await (const ev of cfg.provider.stream({
          model: dispatchModel,
          messages: messagesForCall,
          tools: cfg.tools,
          signal: streamSignal,
        })) {
          streamEvents.push(ev);
          events.emit(ev);
          if (signal.aborted) break;
        }
      } catch (rawErr) {
        // AbortError from our per-turn timeout is restructured as a clean
        // "stream timed out" error so the retry logic (PER_REASON_MAX_RETRIES)
        // picks it up as a retryable timeout.
        const err =
          streamCtrl.signal.aborted && !signal.aborted
            ? Object.assign(new Error("stream timed out"), { name: "AbortError" })
            : rawErr;
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
        recordHealthFailure(cfg.provider.id, cfg.model, errMsg);

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
          /\b400\b|bad.?request|invalid.*message|tool.*role|messages.*tool|tool_result.*tool_use|empty.?input/i.test(
            errMsg,
          ) &&
          !/context.?length|too long|max.*tokens|context_length_exceeded/i.test(
            errMsg,
          );
        if (is400Structural && _historyRepairLevel < 4) {
          // Helper: after any repair, ensure history is never empty.
          // An empty messages array will fail with a different error; keep at
          // minimum the system messages, or the last user message as a fallback.
          const ensureNonEmpty = (msgs: Message[]): Message[] => {
            if (msgs.length > 0) return msgs;
            return _recoverMinimalContext(history);
          };
          if (_historyRepairLevel === 0) {
            _historyRepairLevel = 1;
            const repaired = ensureNonEmpty(_sanitizeHistory(history));
            history.length = 0;
            history.push(...repaired);
          } else if (_historyRepairLevel === 1) {
            // Level 2: targeted orphan cleanup — strip tool_result messages
            // that have no matching tool_use above them. This is the most
            // common cause of structural 400s after compaction and is free
            // (no LLM call, no I/O).
            _historyRepairLevel = 2;
            const deorphaned = ensureNonEmpty(
              _stripOrphanedToolResults(_sanitizeHistory(history)),
            );
            history.length = 0;
            history.push(...deorphaned);
          } else if (_historyRepairLevel === 2) {
            _historyRepairLevel = 3;
            const stripped = ensureNonEmpty(_stripAllToolTurns(history));
            history.length = 0;
            history.push(...stripped);
            events.emit({
              type: "error",
              message:
                "Tool history stripped due to repeated API errors — continuing with text context only.",
              retryable: true,
            });
          } else if (_historyRepairLevel === 3) {
            _historyRepairLevel = 4;
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
      } finally {
        // Clean up per-turn stream timeout resources. The timer and race
        // signal must be disposed every turn regardless of success/failure
        // to prevent timer leaks across long autonomous sprints.
        if (streamTimer) clearTimeout(streamTimer);
        cancelStreamRace();
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
      recordHealthSuccess(cfg.provider.id, cfg.model, 0);
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
        if (cfg.session) {
          void cfg.session.append({ type: "message", ts: new Date().toISOString(), message: assembled.message });
          _localLoopGuard.observeMessage(assembled.message);
        }
      }
      try {
        cfg.loopDetector?.track({
          toolCalls: toolUses.map((t) => ({ name: t.name, args: t.input })),
          message: assembled.message,
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

      const toolResults = await executeToolCalls(
        toolUses,
        cfg,
        events,
      );
      for (const tr of toolResults) {
        _localLoopGuard.observe(tr.call, tr.result);
      }
      if (_localLoopGuard.isLoopDetected()) {
        const reason = _localLoopGuard.reason() ?? 'loop detected';
        events.emit({
          type: 'error',
          message: `[loop] ${reason} — aborting session to prevent infinite loop`,
          reason: 'loop',
          retryable: false,
        });
        stopReason = 'loop';
        events.emit({ type: 'turn_end', turnId, stopReason });
        break;
      }
      const historyLenBeforeResults = history.length;
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
      if (cfg.session) {
        const toolResultMessages = appended.slice(historyLenBeforeResults);
        for (const toolResultMsg of toolResultMessages) {
          void cfg.session.append({ type: "message", ts: new Date().toISOString(), message: toolResultMsg });
        }
      }

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
    if (isJsonParseFailure(input)) {
      const truncated = input.raw.length > 400 ? input.raw.slice(0, 400) + "…" : input.raw;
      const result: ToolResult = {
        content: `Your tool call had invalid JSON arguments and was rejected. Original raw input (truncated): ${truncated}. Please re-emit the call with valid JSON.`,
        isError: true,
      };
      events.emit({ type: "tool_exec_start", id: call.id, name: call.name, input: call.input });
      events.emit({ type: "tool_exec_end", id: call.id, output: result.content, isError: true, durationMs: 0 });
      return { call, result };
    }
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
    }
    if (
      cfg.approvalBus?.requiresApproval(call.name, input) &&
      !cfg.autoApprove
    ) {
      // Race against abort so Esc while an approval prompt is showing
      // doesn't leave the TUI frozen with busy=true forever.
      // IMPORTANT: the abort listener must be removed after the race resolves
      // to prevent listener leaks on cfg.signal across long autonomous runs.
      const removeApprovalAbort: { fn: (() => void) | null } = { fn: null };
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
          const handler = (): void => res("deny");
          cfg.signal!.addEventListener("abort", handler, { once: true });
          removeApprovalAbort.fn = () => {
            cfg.signal!.removeEventListener("abort", handler);
          };
        }),
      ]);
      // Clean up the abort listener — it was never meant to persist past
      // the approval decision. Left unchecked, it accumulates across every
      // tool call in long-horizon autonomous runs.
      removeApprovalAbort.fn?.();
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

    const toolTimeoutMs = 120_000;
    const toolTimeoutCtrl = new AbortController();
    const toolTimer = setTimeout(() => toolTimeoutCtrl.abort(), toolTimeoutMs);
    const { signal: toolSignal, cancel: cancelToolRace } = raceSignals(
      cfg.signal!,
      toolTimeoutCtrl.signal,
    );

    const started = Date.now();
    let result: ToolResult;
    let toolTimedOut = false;
    try {
      result = await cfg.toolExecutor.execute({ ...call, input }, toolSignal);
    } catch (err) {
      if (toolTimeoutCtrl.signal.aborted) {
        result = {
          content: "[TIMEOUT] Tool exceeded 120s",
          isError: true,
        };
        toolTimedOut = true;
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

    // Auto-retry on timeout: when a tool exceeds the deadline, retry once
    // transparently. This handles transient hangs (slow MCP server, network
    // blip, kernel scheduler stall) without showing the user an error.
    // We retry at most once per tool call to avoid infinite loops.
    if (toolTimedOut) {
      events.emit({
        type: "error",
        message: `Tool "${call.name}" timed out — retrying once`,
        retryable: true,
      });
      // Reset timeout for the retry
      const retryTimeoutMs = 120_000;
      const retryCtrl = new AbortController();
      const retryTimer = setTimeout(() => retryCtrl.abort(), retryTimeoutMs);
      const { signal: retrySignal, cancel: cancelRetry } = raceSignals(
        cfg.signal!,
        retryCtrl.signal,
      );
      const retryStarted = Date.now();
      try {
        result = await cfg.toolExecutor.execute({ ...call, input }, retrySignal);
        toolTimedOut = false;
      } catch (err) {
        if (retryCtrl.signal.aborted) {
          result = {
            content: `[TIMEOUT] Tool "${call.name}" timed out after 120s (retry also timed out)`,
            isError: true,
          };
        } else {
          result = {
            content: `Tool execution failed on retry: ${String(err)}`,
            isError: true,
          };
        }
      } finally {
        clearTimeout(retryTimer);
        cancelRetry();
        // Bonus: log the retry duration so the audit trail captures the total
        // time the user waited. The main durationMs below covers the original;
        // we add the retry time.
      }
      // Emit a second tool_exec_end so the TUI can show the retry result.
      // The first tool_exec_end from the timeout is emitted below; we emit
      // the retry result as a second event with the same id so the TUI's
      // event projection overwrites the previous "timed out" state.
      events.emit({
        type: "tool_exec_end",
        id: call.id,
        output: result.content,
        isError: result.isError,
        durationMs: Date.now() - retryStarted,
        ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
      });
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
