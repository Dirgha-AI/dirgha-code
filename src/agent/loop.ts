/**
 * agent/loop.ts — Main agentic loop (refactored: 367 → 90 lines)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Message, ModelResponse, ContentBlock } from '../types.js';

export interface TraceEntry {
  tool: string;
  inputSummary: string;
  outputSummary: string;
  success: boolean;
  error?: string;
}

export function buildTraceContext(traceLog: TraceEntry[]): string {
  if (!traceLog.length) return '';
  const lines = traceLog.map((e, i) =>
    `  ${i + 1}. [${e.tool}] ${e.inputSummary} → ${e.success ? '✓' : '✗'} ${e.outputSummary}`
  );
  return `\n\n--- Previous attempt history (${traceLog.length} steps) ---\n${lines.join('\n')}\n--- End history ---`;
}
import { callGateway } from './gateway.js';
import { classifyQuery, resolveModel } from './routing.js';
import { getMemoryManager, resetMemoryManager } from '../memory/manager.js';
import { getActiveSkillsPrompt, getSkillPrompt } from '../skills/index.js';
import { initPermissionStore } from '../permission/store.js';
import { buildSystemPrompt } from './context.js';
export { buildSystemPrompt } from './context.js';
import { buildMoim } from './moim.js';
import { executeAllTools } from './tool-execution.js';
import { syncMemoryAfterLoop } from './memory-sync.js';
import { createBillingContext, preRequestCheck, recordApiUsage, getBillingSummary } from '../billing/middleware.js';
import { countTokensInMessages } from '../billing/meter.js';
import { LoopDetector, buildReflectionPrompt } from './loop-detector.js';
import { withModelFallback, isFallbackError } from './model-fallback.js';
import { appendReflection, classifyTask, normalizeErrorSignature, type StepRecord } from './reflection.js';
import { getSkillHints } from './skill-registry.js';
import { logger } from '../utils/logger.js';
import { redactSecrets } from './secrets.js';

const MAX_ITERATIONS = 20;
const REFLECTION_THRESHOLDS = [0.5, 0.8] as const; // inject reflection at 50% and 80%

/** Race a promise against an AbortSignal — rejects immediately when signal fires. */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { signal.removeEventListener('abort', onAbort); reject(e); }
    );
  });
}

export async function runAgentLoop(
  userInput: string,
  messages: Message[],
  model: string,
  onText: (t: string) => void,
  onTool: (name: string, input: Record<string, any>) => void,
  ctx?: import('../types.js').ReplContext,
  skillOverride?: string,
  options?: { maxTurns?: number; sessionId?: string; signal?: AbortSignal; disableTools?: boolean },
  onThinking?: (t: string) => void,
  onToolResult?: (toolUseId: string, name: string, result: string, isError: boolean) => void,
): Promise<{ messages: Message[]; tokensUsed: number; costUsd: number; traceLog: TraceEntry[] }> {
  // Initialize billing context
  const billing = createBillingContext(options?.sessionId ?? `session_${Date.now()}`);
  
  // Pre-flight quota check
  const estimatedTokens = countTokensInMessages([...messages, { role: 'user', content: userInput }]);
  const preCheck = await preRequestCheck(billing, estimatedTokens * 2); // 2x estimate for response
  if (!preCheck.allowed) {
    onText(`\n⚠️ ${preCheck.reason}`);
    if (preCheck.quotaSummary) {
      onText(`\n${preCheck.quotaSummary}`);
    }
    return { messages, tokensUsed: 0, costUsd: 0, traceLog: [] };
  }

  // Initialize — reset memory singleton so each session starts clean
  try { initPermissionStore(); } catch (err) {
    logger.warn('Failed to init permission store', { error: err instanceof Error ? err.message : String(err) });
  }
  resetMemoryManager();
  const memMgr = getMemoryManager();
  try { await memMgr.initialize(billing.sessionId); } catch (err) {
    logger.warn('Failed to initialize memory manager', { error: err instanceof Error ? err.message : String(err) });
  }
  
  // Prefetch relevant memories before building system prompt
  let memContext = '';
  try { memContext = await memMgr.prefetchAll(userInput); } catch { /* best-effort */ }

  // Build system prompt + inject learned skill hints
  let systemPrompt = await buildSystemPrompt();
  if (memContext) systemPrompt += `\n\n${memContext}`;
  if (skillOverride) {
    try { systemPrompt += getSkillPrompt(skillOverride); } catch (err) {
      logger.warn('Failed to get skill prompt', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  try { systemPrompt += getSkillHints(userInput); } catch (err) {
    logger.warn('Failed to get skill hints', { error: err instanceof Error ? err.message : String(err) });
  }

  // --no-tools / disableTools: hard-block tool calls at two layers.
  // 1. System prompt gets a prepended instruction so compliant models
  //    don't even try.
  // 2. Tool execution (below) returns an empty block set immediately
  //    when a model ignores the instruction, preventing runaway loops.
  const disableTools = options?.disableTools === true;
  if (disableTools) {
    systemPrompt =
      'You are in pure-chat mode. You MUST NOT use any tools. ' +
      'Answer directly from your own knowledge. ' +
      'If a request genuinely requires a tool, say so and stop.\n\n' +
      systemPrompt;
  }

  let tokensUsed = 0;
  let costUsdTotal = 0;
  const resolvedModel = model === 'auto' ? resolveModel(classifyQuery(userInput, messages)) : model;
  const history: Message[] = [...messages, { role: 'user', content: userInput }];

  // Reflection: track tool steps for self-improvement
  const reflectionSteps: StepRecord[] = [];
  // Trace log: capture per-tool input/output summaries for replanning context
  const traceLog: TraceEntry[] = [];
  let lastErrorText = '';
  // Outcome tracking
  let abortFired = false;
  let lastStopReason: string | undefined;
  let maxIterationsHit = false;
  let lastToolHadError = false;
  const _origOnTool = onTool;
  const reflectingOnTool = (name: string, input: Record<string, any>) => {
    _origOnTool(name, input);
    reflectionSteps.push({ tool: name, input, output: '', success: true, credit: 0, durationMs: 0 });
  };
  // Replace onTool with reflecting version
  onTool = reflectingOnTool;

  // Wrap onText to detect if streaming occurred (avoids double-emit for streaming providers)
  let textStreamedThisTurn = false;
  const trackingOnText = (t: string): void => {
    textStreamedThisTurn = true;
    onText(redactSecrets(t));
  };

  const trackingOnThinking = (t: string): void => {
    onThinking?.(t);
  };

  // Compact if too long (message count) or token-heavy
  const compactionNeeded = history.length > 60 || countTokensInMessages(history) > 80_000;
  if (compactionNeeded) {
    try {
      const { compactMessages } = await import('./compaction.js');
      const { messages: compacted, tier } = await compactMessages(history);
      history.splice(0, history.length, ...compacted);
      // Notify TUI about compaction tier via onText
      if (tier > 0) onText(`\n[context compacted: ${history.length} messages · tier ${tier}]\n`);
    } catch (err) {
      logger.warn('Failed to compact messages', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Main iteration loop
  const maxIterations = options?.maxTurns ?? MAX_ITERATIONS;
  const loopDetector = new LoopDetector();
  const reflectedAt = new Set<number>(); // track which thresholds we've reflected at

  for (let i = 0; i < maxIterations; i++) {
    // Check abort signal
    if (options?.signal?.aborted) { abortFired = true; break; }

    // Inject reflection prompt at 50% and 80% thresholds
    for (const threshold of REFLECTION_THRESHOLDS) {
      const atIter = Math.floor(maxIterations * threshold);
      if (i === atIter && !reflectedAt.has(atIter)) {
        reflectedAt.add(atIter);
        history.push({ role: 'user', content: buildReflectionPrompt(i, maxIterations) });
      }
    }

    // Detect infinite loops
    if (loopDetector.isLooping()) {
      const reason = loopDetector.getLoopReason();
      history.push({ role: 'user', content: buildReflectionPrompt(i, maxIterations, reason) });
      loopDetector.reset();
    }

    let response: ModelResponse;
    let turnModel = resolvedModel;
    try {
      const moimMsg: Message = { role: 'user', content: buildMoim() };
      const augmented = [...history.slice(0, -1), moimMsg, history[history.length - 1]!];
      textStreamedThisTurn = false;
      const { result, model: usedModel } = await raceAbort(
        withModelFallback(
          resolvedModel,
          (m) => callGateway(augmented, systemPrompt, m, trackingOnText, trackingOnThinking),
          (from, _to, reason) => onText(`\n⚠️  ${from} failed: ${reason}\nYou're still on ${from} — type /model <name> to switch manually.\n`),
        ),
        options?.signal,
      );
      response = result;
      turnModel = usedModel;
    } catch (err) {
      // AbortError = user cancelled via ESC — return immediately, skip all cleanup
      if ((err as Error).name === 'AbortError') {
        abortFired = true;
        return { messages: history, tokensUsed, costUsd: costUsdTotal, traceLog };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      // 402 = out of credits mid-loop — save checkpoint so work isn't lost
      if (errMsg.includes('402') || errMsg.includes('NO_CREDITS') || errMsg.toLowerCase().includes('insufficient credits')) {
        try {
          const ckptDir = join(homedir(), '.dirgha', 'checkpoints');
          mkdirSync(ckptDir, { recursive: true });
          const sid = options?.sessionId ?? `oom_${Date.now()}`;
          const ckptPath = join(ckptDir, `${sid}.json`);
          writeFileSync(ckptPath, JSON.stringify({ userInput, messages: history, model: resolvedModel, ts: Date.now() }, null, 2));
          onText(`\n⛔ Out of credits — partial work saved.\n   Resume: dirgha resume --session ${sid}\n   Top up: dirgha.ai/billing\n`);
        } catch { /* checkpoint save failed — non-fatal */ }
      } else if (!isFallbackError(err)) {
        onText(`✗ ${errMsg}`);
      }
      lastToolHadError = true;
      break;
    }

    // Record billing for this turn
    const usage = recordApiUsage(billing, turnModel, history, response);
    tokensUsed += usage.totalTokens;
    costUsdTotal += usage.costUsd;

    // Debug mode: emit per-turn diagnostics to stderr
    if (process.env['DIRGHA_DEBUG'] === '1') {
      const cacheHit = (response.usage as any)?.cache_read_input_tokens > 0;
      process.stderr.write(
        `[debug] turn=${i + 1} model=${turnModel} ` +
        `in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `cost=$${usage.costUsd.toFixed(5)} cache=${cacheHit ? 'HIT' : 'MISS'}\n`
      );
    }

    const textBlocks = response.content.filter(b => b.type === 'text');
    let toolBlocks = response.content.filter(b => b.type === 'tool_use') as Array<ContentBlock & { type: 'tool_use' }>;

    // Emit text for non-streaming responses (skip if already streamed to avoid double-emit)
    if (!textStreamedThisTurn) {
      for (const block of textBlocks) {
        if (block.text) onText(redactSecrets(block.text));
      }
    }

    // Capture stop_reason for outcome tracking
    lastStopReason = (response as any).stop_reason ?? undefined;

    history.push({ role: 'assistant', content: response.content });

    // Hard-block tool execution when disableTools is set. We drop the
    // tool-use blocks and break out immediately. The user already got
    // whatever text the model produced (if any); further tool attempts
    // are a loop bait with no upside.
    if (disableTools && toolBlocks.length > 0) {
      onText('\n[tools disabled — dropping ' + toolBlocks.length + ' tool call(s) and exiting]');
      toolBlocks = [];
      break;
    }

    // No tools - we're done
    if (toolBlocks.length === 0) break;

    // Track tool calls for loop detection
    for (const block of toolBlocks) loopDetector.record(block.name ?? '', (block as any).input ?? {});

    // Execute all tools in parallel
    const toolResultBlocks = await raceAbort(executeAllTools(toolBlocks, ctx, turnModel, onTool), options?.signal);

    // Process tool results: update reflection, trace log, and notify TUI (one pass)
    const toolResultArr = Array.isArray(toolResultBlocks) ? toolResultBlocks : [];
    for (const resultBlock of toolResultArr) {
      const rb = resultBlock as any;
      if (rb?.type !== 'tool_result') continue;
      const matchingBlock = toolBlocks.find((b: any) => b.id === rb.tool_use_id);
      const contentText: string = Array.isArray(rb.content)
        ? rb.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
        : typeof rb.content === 'string' ? rb.content : '';
      const isError = rb.is_error === true || contentText.startsWith('Error:') || contentText.includes('[BLOCKED');

      // Notify TUI/caller once
      onToolResult?.(rb.tool_use_id, matchingBlock?.name ?? 'unknown', contentText, isError);

      // Update reflection step
      const step = reflectionSteps.slice().reverse().find(
        s => !s.output && rb.tool_use_id && toolBlocks.some(b => (b as any).id === rb.tool_use_id && (b as any).name === s.tool)
      );
      if (step) {
        step.output = contentText.slice(0, 500);
        step.success = !isError;
        step.credit = isError ? -1 : 1;
        if (isError) { lastToolHadError = true; lastErrorText = contentText; }
      }

      // Trace log
      traceLog.push({
        tool: matchingBlock?.name ?? 'unknown',
        inputSummary: JSON.stringify(matchingBlock?.input ?? {}).slice(0, 100),
        outputSummary: contentText.slice(0, 180),
        success: !isError,
        error: contentText.startsWith('Error:') ? contentText.slice(7, 200) : undefined,
      });
    }

    history.push({ role: 'user', content: toolResultBlocks });

    // Checkpoint after every tool call — long-horizon tasks survive crashes/OOM/rate-limits
    if (options?.sessionId) {
      try {
        const ckptDir = join(homedir(), '.dirgha', 'checkpoints');
        mkdirSync(ckptDir, { recursive: true });
        writeFileSync(
          join(ckptDir, `${options.sessionId}.json`),
          JSON.stringify({ userInput, messages: history, model: resolvedModel, ts: Date.now(), turn: i }, null, 2)
        );
      } catch { /* checkpoint save non-fatal */ }
    }
  }

  // Detect if we exhausted iterations without natural end_turn
  if (lastStopReason !== 'end_turn' && reflectionSteps.length > 0 && !abortFired) {
    maxIterationsHit = true;
  }

  // Sync memory after loop
  await syncMemoryAfterLoop(history, userInput);

  // Append reflection entry for self-improvement tracking
  const lastMsg = history[history.length - 1];
  const lastText = typeof lastMsg?.content === 'string' ? lastMsg.content :
    Array.isArray(lastMsg?.content) ? (lastMsg.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('') : '';
  if (lastText) lastErrorText = lastText;

  // Determine final outcome based on how the loop exited
  let finalOutcome: 'success' | 'failure' | 'aborted';
  if (abortFired) {
    finalOutcome = 'aborted';
  } else if (lastToolHadError) {
    finalOutcome = 'failure';
  } else if (maxIterationsHit) {
    finalOutcome = 'failure';
  } else if (lastStopReason === 'end_turn') {
    finalOutcome = 'success';
  } else {
    finalOutcome = 'success';
  }

  appendReflection({
    sessionId: options?.sessionId ?? `s_${Date.now()}`,
    timestamp: Date.now(),
    model: resolvedModel,
    userInput: userInput.slice(0, 200),
    taskType: classifyTask(userInput),
    steps: reflectionSteps,
    totalTokens: tokensUsed,
    finalOutcome,
    errorSignature: normalizeErrorSignature(lastErrorText),
  });

  // Emit billing summary on verbose
  if (ctx && process.env.DEBUG) {
    console.error(getBillingSummary(billing));
  }

  return { messages: history, tokensUsed, costUsd: costUsdTotal, traceLog };
}

export async function runSingleTurn(
  prompt: string,
  model: string,
  onText: (t: string) => void,
  onTool: (name: string, input: Record<string, any>) => void,
): Promise<number> {
  const { tokensUsed } = await runAgentLoop(prompt, [], model, onText, onTool, undefined, undefined, { sessionId: `single_${Date.now()}` });
  return tokensUsed;
}
