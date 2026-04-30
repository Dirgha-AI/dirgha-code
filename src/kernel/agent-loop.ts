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
 *   5. Steering and follow-up queues allow mid-flight control (see queues.ts).
 */

import type {
  Message,
  AgentMessage,
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
} from './types.js';
import type { EventStream } from './event-stream.js';
import { assembleTurn, extractToolUses, appendToolResults, convertToLlm } from './message.js';
import { SteeringQueue, FollowUpQueue } from './queues.js';

/**
 * Controller interface for mid-flight agent steering and follow-up.
 *
 * Exposed via `cfg.controller` so callers can inject messages without
 * changing the return type of `runAgentLoop` (which remains
 * `Promise<AgentResult>` for backwards compatibility).
 *
 * Usage:
 *   const controller = { steer: (msg) => {}, followUp: (msg) => {} };
 *   const result = await runAgentLoop({ ...cfg, controller });
 *   // Later, from another context:
 *   controller.steer({ role: 'user', content: 'Stop and do this instead' });
 */
export interface AgentController {
  /** Queue a steering message (drain mode: all). Replaces current turn. */
  steer: (msg: AgentMessage) => void;
  /** Queue a follow-up message (drain mode: one-at-a-time). Runs after current turn. */
  followUp: (msg: AgentMessage) => void;
}

export interface AgentLoopConfig {
  sessionId: string;
  model: string;
  /**
   * Initial transcript. Plain `Message[]` is accepted (a `Message` is a
   * structural `AgentMessage` since `ui` and `hidden` are optional), so
   * existing callers keep working unchanged.
   */
  messages: AgentMessage[];
  tools: ToolDefinition[];
  maxTurns: number;
  provider: Provider;
  toolExecutor: ToolExecutor;
  events: EventStream;
  approvalBus?: ApprovalBus;
  /**
   * When true, every tool call is auto-approved without going through
   * the ApprovalBus. Set by `dirgha --yolo` or by the YOLO mode
   * preamble. The ApprovalBus is otherwise the sole gate.
   */
  autoApprove?: boolean;
  errorClassifier?: ErrorClassifier;
  hooks?: AgentHooks;
  /**
   * Per-turn context transform. Receives the full transcript (post-projection
   * to `Message[]`) and returns the messages to actually send to the model.
   * Kept on `Message[]` so existing transforms (compaction, etc.) need no
   * changes.
   */
  contextTransform?: (messages: Message[]) => Promise<Message[]>;
  toolConcurrency?: 'serial' | 'parallel';
  signal?: AbortSignal;
  /**
   * Optional controller for mid-flight steering and follow-up.
   * When provided, the caller can inject messages via `steer()` and `followUp()`.
   * The controller object is populated with function references during loop
   * initialisation (mutated in-place so the caller sees them).
   */
  controller?: AgentController;
}

export async function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentResult> {
  const events = cfg.events;
  const history: AgentMessage[] = [...cfg.messages];
  const totals: UsageTotal = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
  let stopReason: StopReason = 'end_turn';
  let turnCount = 0;

  // Initialise steering and follow-up queues.
  const steeringQueue = new SteeringQueue();
  const followUpQueue = new FollowUpQueue();

  // Populate the controller object in-place so the caller can use it.
  if (cfg.controller) {
    cfg.controller.steer = (msg) => steeringQueue.enqueue(msg);
    cfg.controller.followUp = (msg) => followUpQueue.enqueue(msg);
  }

  events.emit({ type: 'agent_start', sessionId: cfg.sessionId, model: cfg.model });

  try {
    for (let turnIndex = 0; turnIndex < cfg.maxTurns; ) {
      if (cfg.signal?.aborted) { stopReason = 'aborted'; break; }

      if (cfg.hooks?.beforeTurn) {
        // Project to Message[] so hooks observe exactly what the LLM does
        // (no ui/hidden leakage via covariant assignability).
        const decision = await cfg.hooks.beforeTurn(turnIndex, convertToLlm(history));
        if (decision === 'abort') { stopReason = 'aborted'; break; }
      }

      const turnId = `t${turnIndex}-${Date.now().toString(36)}`;
      events.emit({ type: 'turn_start', turnId, turnIndex });

      // Projection boundary: strip UI-only metadata + drop hidden messages
      // before either the optional contextTransform or the provider call.
      const llmMessages = convertToLlm(history);
      const messagesForCall = cfg.contextTransform
        ? await cfg.contextTransform(llmMessages)
        : llmMessages;

      const streamEvents: AgentEvent[] = [];
      try {
        for await (const ev of cfg.provider.stream({
          model: cfg.model,
          messages: messagesForCall,
          tools: cfg.tools,
          signal: cfg.signal,
        })) {
          streamEvents.push(ev);
          events.emit(ev);
        }
      } catch (err) {
        const classified = cfg.errorClassifier?.classify(err, cfg.provider.id, cfg.model);
        events.emit({
          type: 'error',
          message: String(err instanceof Error ? err.message : err),
          reason: classified?.reason,
          retryable: classified?.retryable ?? false,
        });
        stopReason = 'error';
        events.emit({ type: 'turn_end', turnId, stopReason });
        break;
      }

      const assembled = assembleTurn(streamEvents);
      totals.inputTokens += assembled.inputTokens;
      totals.outputTokens += assembled.outputTokens;
      totals.cachedTokens += assembled.cachedTokens;
      history.push(assembled.message);

      // After provider stream completes, drain steering queue.
      // If non-empty, push steered messages to history and continue looping
      // (don't break on end_turn — the steered message becomes the next prompt).
      const steeredMessages = steeringQueue.drain();
      if (steeredMessages && steeredMessages.length > 0) {
        // Remove the assistant message we just added (the steered message replaces it).
        history.pop();
        // Push the steered messages instead.
        history.push(...steeredMessages);
        // Re-run the loop without incrementing turnIndex
        // (the steered message is the new prompt for the same turn).
        events.emit({ type: 'turn_end', turnId, stopReason: 'tool_use' });
        await cfg.hooks?.afterTurn?.(turnIndex, totals);
        continue;
      }

      // No steering — check if we're done or need tool execution.
      const toolUses = extractToolUses(assembled.message);
      if (toolUses.length === 0) {
        // Check for follow-up messages before breaking.
        // If a follow-up exists, it becomes the next turn.
        const followUpMessages = followUpQueue.drain();
        if (followUpMessages) {
          history.push(...followUpMessages);
          turnCount = turnIndex + 1;
          events.emit({ type: 'turn_end', turnId, stopReason: 'tool_use' });
          await cfg.hooks?.afterTurn?.(turnIndex, totals);
          turnIndex++;
          continue;
        }

        // No follow-up, we're done.
        turnCount = turnIndex + 1;
        events.emit({ type: 'turn_end', turnId, stopReason: 'end_turn' });
        await cfg.hooks?.afterTurn?.(turnIndex, totals);
        break;
      }

      // Execute tool calls and continue to next turn.
      turnCount = turnIndex + 1;
      const toolResults = await executeToolCalls(toolUses, cfg, events);
      const appended = appendToolResults(history, toolResults.map(r => ({
        toolUseId: r.call.id,
        content: r.result.content,
        isError: r.result.isError,
      })));
      history.length = 0;
      history.push(...appended);

      events.emit({ type: 'turn_end', turnId, stopReason: 'tool_use' });
      await cfg.hooks?.afterTurn?.(turnIndex, totals);

      // Only increment turnIndex if we're not being steered.
      turnIndex++;
    }
  } finally {
    events.emit({ type: 'agent_end', sessionId: cfg.sessionId, stopReason, usage: totals });
  }

  // Project to Message[] on return — AgentResult.messages is typed Message[],
  // so honor that contract here. Sprint B/C can widen later if needed.
  return { messages: convertToLlm(history), usage: totals, stopReason, turnCount, sessionId: cfg.sessionId };
}

async function executeToolCalls(
  toolUses: ToolCall[],
  cfg: AgentLoopConfig,
  events: EventStream,
): Promise<Array<{ call: ToolCall; result: ToolResult }>> {
  const run = async (call: ToolCall): Promise<{ call: ToolCall; result: ToolResult }> => {
    let input = call.input;
    if (cfg.hooks?.beforeToolCall) {
      const decision = await cfg.hooks.beforeToolCall(call);
      if (decision?.block) {
        const result: ToolResult = { content: decision.reason, isError: true };
        return { call, result };
      }
      if (decision && !decision.block && decision.replaceInput !== undefined) {
        input = decision.replaceInput;
      }
    }
    if (cfg.approvalBus?.requiresApproval(call.name, input) && !cfg.autoApprove) {
      const decision = await cfg.approvalBus.request({
        id: call.id,
        tool: call.name,
        summary: `${call.name}: ${truncateForSummary(input)}`,
      });
      if (decision === 'deny' || decision === 'deny_always') {
        return { call, result: { content: `Tool call ${call.name} denied by user.`, isError: true } };
      }
    }

    events.emit({ type: 'tool_exec_start', id: call.id, name: call.name, input });
    const started = Date.now();
    let result: ToolResult;
    try {
      result = await cfg.toolExecutor.execute({ ...call, input }, cfg.signal ?? defaultSignal());
    } catch (err) {
      result = { content: `Tool execution failed: ${String(err)}`, isError: true };
    }
    const durationMs = Date.now() - started;
    result = await cfg.hooks?.afterToolCall?.({ ...call, input }, result) ?? result;
    events.emit({
      type: 'tool_exec_end',
      id: call.id,
      output: result.content,
      isError: result.isError,
      durationMs,
    });
    return { call: { ...call, input }, result };
  };

  if (cfg.toolConcurrency === 'parallel' && toolUses.length > 1) {
    return Promise.all(toolUses.map(run));
  }
  const out: Array<{ call: ToolCall; result: ToolResult }> = [];
  for (const u of toolUses) out.push(await run(u));
  return out;
}

function truncateForSummary(input: unknown, max = 160): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function defaultSignal(): AbortSignal {
  return new AbortController().signal;
}
