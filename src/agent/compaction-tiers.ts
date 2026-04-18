/**
 * compaction-tiers.ts — Tier 2 (tool-pair summarization) + Tier 3 (middle-out removal)
 */
import type { Message } from '../types.js';
import { estimateMessagesTokens, getContextLimit } from '../utils/token-counter.js';

/** Tier 2: collapse consecutive tool-use/tool-result pairs older than last 6 messages. */
export function summarizeToolPairs(messages: Message[]): Message[] {
  if (messages.length <= 6) return messages;

  const safeEnd = messages.length - 6;
  const result: Message[] = [];
  let i = 0;

  while (i < safeEnd) {
    const cur = messages[i];
    const next = messages[i + 1];

    const isToolUse =
      cur.role === 'assistant' &&
      Array.isArray(cur.content) &&
      cur.content.some((b: any) => b.type === 'tool_use');

    const isToolResult =
      next !== undefined &&
      next.role === 'user' &&
      Array.isArray(next.content) &&
      next.content.some((b: any) => b.type === 'tool_result');

    if (isToolUse && isToolResult && i + 1 < safeEnd) {
      const toolName =
        (cur.content as any[]).find((b: any) => b.type === 'tool_use')?.name ?? 'tool';
      const rawResult = (next.content as any[]).find((b: any) => b.type === 'tool_result');
      const resultStr = rawResult?.content
        ? JSON.stringify(rawResult.content).slice(0, 200)
        : '(no result)';

      result.push({
        role: 'user',
        content: `[Tool: ${toolName} → ${resultStr}]`,
      });
      i += 2;
    } else {
      result.push(cur);
      i++;
    }
  }

  // Append the preserved tail (last 6 messages)
  result.push(...messages.slice(safeEnd));
  return result;
}

/** Tier 3: remove removalPct of tool-result messages from the middle of history. */
export function middleOutCompact(messages: Message[], removalPct: number): Message[] {
  const head = messages.slice(0, 2);
  const tail = messages.slice(-6);
  const middle = messages.slice(2, messages.length - 6);

  if (middle.length === 0) return messages;

  const toolResultIdxs = middle
    .map((m, i) => ({ m, i }))
    .filter(
      ({ m }) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        m.content.some((b: any) => b.type === 'tool_result'),
    )
    .map(({ i }) => i);

  const removeCount = Math.ceil(toolResultIdxs.length * removalPct);
  const midStart = Math.floor((toolResultIdxs.length - removeCount) / 2);
  const toRemove = new Set(toolResultIdxs.slice(midStart, midStart + removeCount));

  const filteredMiddle = middle.filter((_, i) => !toRemove.has(i));
  return [...head, ...filteredMiddle, ...tail];
}

/** Progressively apply middle-out at 10% → 20% → 50% → 100% until below threshold. */
export function progressiveMiddleOut(
  messages: Message[],
  modelId: string,
): Message[] {
  const limit = getContextLimit(modelId);
  const target = limit * 0.8;

  for (const pct of [0.1, 0.2, 0.5, 1.0]) {
    const compacted = middleOutCompact(messages, pct);
    if (estimateMessagesTokens(compacted) < target) return compacted;
  }

  return messages.slice(-8);
}
