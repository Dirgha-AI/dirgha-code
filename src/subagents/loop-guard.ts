/**
 * Unified loop guard. Replaces the dual mechanism of LoopDetector
 * (output stagnation + identical tool calls) plus REFUSAL_ABORT_THRESHOLD
 * (identical refused tool calls) that previously lived in agent-loop.ts.
 *
 * Detects four loop patterns:
 *   1. Same tool + identical args called >= maxRepeatedToolCalls times.
 *   2. Same tool + args + result.isError=true >= maxIdenticalRefusals times.
 *   3. Same tool + args + content-prefix repeated >= maxIdenticalContentRepeats times.
 *   4. Assistant output hash unchanged for >= maxTurnsWithoutProgress turns.
 */

import type { Message, ToolCall, ToolResult } from '../kernel/types.js';

export interface LoopGuardConfig {
  maxRepeatedToolCalls: number;
  maxTurnsWithoutProgress: number;
  maxIdenticalRefusals: number;
  maxIdenticalContentRepeats: number;
  contentPrefixLen: number;
}

const DEFAULT_CONFIG: LoopGuardConfig = {
  maxRepeatedToolCalls: 5,
  maxTurnsWithoutProgress: 3,
  maxIdenticalRefusals: 2,
  maxIdenticalContentRepeats: 2,
  contentPrefixLen: 200,
};

/**
 * Stable JSON stringify with sorted keys. Used so identical args with
 * different key order produce the same dedupe key.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => '"' + k + '":' + stableStringify((value as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

export class StableLoopGuard {
  private readonly config: LoopGuardConfig;
  private toolCallHistory = new Map<string, number>();
  private refusalHistory = new Map<string, number>();
  private contentRefusalHistory = new Map<string, number>();
  private turnsWithoutProgress = 0;
  private lastOutputHash: string | null = null;
  private lastTriggeredReason: string | null = null;

  constructor(config: Partial<LoopGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record one observed tool call and its result.
   * Increments the relevant counters and updates the stagnation hash.
   */
  observe(call: ToolCall, result: ToolResult): void {
    const argsKey = stableStringify(call.input ?? {});
    const callKey = `${call.name}:${argsKey}`;
    this.toolCallHistory.set(callKey, (this.toolCallHistory.get(callKey) ?? 0) + 1);

    if (result.isError === true) {
      this.refusalHistory.set(callKey, (this.refusalHistory.get(callKey) ?? 0) + 1);
      const prefix =
        typeof result.content === 'string'
          ? result.content.slice(0, this.config.contentPrefixLen)
          : '';
      const contentKey = `${callKey}:${prefix}`;
      this.contentRefusalHistory.set(
        contentKey,
        (this.contentRefusalHistory.get(contentKey) ?? 0) + 1,
      );
    }
  }

  /**
   * Record one observed assistant message. Used for output-stagnation detection.
   * Hash is the first contentPrefixLen chars of the message content.
   */
  observeMessage(message: Message | undefined): void {
    if (!message) return;
    const content = message.content;
    let text: string;
    if (typeof content === 'string') {
      text = content;
    } else if (content === undefined || content === null) {
      text = '';
    } else {
      try { text = JSON.stringify(content); } catch { text = ''; }
    }
    const hash = text.slice(0, this.config.contentPrefixLen);
    if (this.lastOutputHash === hash) {
      this.turnsWithoutProgress += 1;
    } else {
      this.lastOutputHash = hash;
      this.turnsWithoutProgress = 1;
    }
  }

  /**
   * Returns true if any of the four loop patterns has crossed its threshold.
   * Side effect: caches the reason for the next reason() call.
   */
  isLoopDetected(): boolean {
    for (const [key, n] of this.toolCallHistory) {
      if (n >= this.config.maxRepeatedToolCalls) {
        this.lastTriggeredReason = `repeated_tool_call: ${key} (${n}x)`;
        return true;
      }
    }
    for (const [key, n] of this.refusalHistory) {
      if (n >= this.config.maxIdenticalRefusals) {
        this.lastTriggeredReason = `repeated_refusal: ${key} (${n}x)`;
        return true;
      }
    }
    for (const [key, n] of this.contentRefusalHistory) {
      if (n >= this.config.maxIdenticalContentRepeats) {
        this.lastTriggeredReason = `repeated_content: ${key} (${n}x)`;
        return true;
      }
    }
    if (this.turnsWithoutProgress >= this.config.maxTurnsWithoutProgress) {
      this.lastTriggeredReason = `output_stagnation: ${this.turnsWithoutProgress} turns without progress`;
      return true;
    }
    return false;
  }

  /**
   * Returns the reason for the most recent loop detection, or null if not loop.
   */
  reason(): string | null {
    return this.isLoopDetected() ? this.lastTriggeredReason : null;
  }

  /**
   * Reset all state. Called between user prompts so loops don't carry across.
   */
  reset(): void {
    this.toolCallHistory.clear();
    this.refusalHistory.clear();
    this.contentRefusalHistory.clear();
    this.turnsWithoutProgress = 0;
    this.lastOutputHash = null;
    this.lastTriggeredReason = null;
  }
}

/**
 * Legacy alias for backward compat with existing code that imports LoopDetector.
 * The old LoopDetector had different methods (track, isLoopDetected, reason, reset)
 * but the same semantic intent. New code should use StableLoopGuard directly.
 */
export { StableLoopGuard as LoopDetector };
