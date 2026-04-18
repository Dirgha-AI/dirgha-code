/**
 * billing/meter.ts — Token counting and usage metering
 */
import type { Message, ContentBlock } from '../types.js';
import type { TokenUsage } from './types.js';
// FIX P1-ISSUE 4.2: Use improved tokenizer for accurate context truncation
import { countTokens, countTokensCached } from './tokenizer-v2.js';

export function countTokensInMessages(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        total += countBlockTokens(block);
      }
    }
  }
  return total;
}

function countBlockTokens(block: ContentBlock): number {
  if (block.type === 'text' && block.text) {
    return countTokens(block.text);
  }
  if (block.type === 'tool_use') {
    // Tool calls: name + JSON args
    const nameTokens = countTokens(block.name ?? '');
    const argsTokens = countTokens(JSON.stringify(block.input ?? {}));
    return nameTokens + argsTokens + 4; // 4 tokens for structure
  }
  return 0;
}

export function extractTokenUsage(
  messages: Message[],
  responseContent: ContentBlock[],
  usage?: { input_tokens?: number; output_tokens?: number }
): TokenUsage {
  // Use provider-reported tokens if available, else estimate
  const inputTokens = usage?.input_tokens ?? countTokensInMessages(messages);
  const outputTokens = usage?.output_tokens ?? countTokensInMessages([{ role: 'assistant', content: responseContent }]);
  const toolCalls = responseContent.filter(c => c.type === 'tool_use').length;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    toolCalls,
  };
}

export function countToolCallTokens(toolName: string, args: Record<string, unknown>): number {
  const nameTokens = countTokens(toolName);
  const argsTokens = countTokens(JSON.stringify(args));
  return nameTokens + argsTokens + 2;
}
