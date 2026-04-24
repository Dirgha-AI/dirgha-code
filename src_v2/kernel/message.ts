/**
 * Message manipulation helpers. Pure functions over Message[].
 */

import type { Message, ContentPart, ToolUsePart, ToolResultPart, AgentEvent } from './types.js';

export function normaliseContent(msg: Message): ContentPart[] {
  if (typeof msg.content === 'string') {
    return msg.content.length > 0 ? [{ type: 'text', text: msg.content }] : [];
  }
  return msg.content;
}

export function extractText(msg: Message): string {
  return normaliseContent(msg)
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('');
}

export function extractToolUses(msg: Message): ToolUsePart[] {
  return normaliseContent(msg).filter((p): p is ToolUsePart => p.type === 'tool_use');
}

export function toolResultMessage(toolUseId: string, content: string, isError = false): Message {
  const part: ToolResultPart = { type: 'tool_result', toolUseId, content, isError };
  return { role: 'user', content: [part] };
}

export function appendToolResults(
  history: Message[],
  results: Array<{ toolUseId: string; content: string; isError: boolean }>,
): Message[] {
  if (results.length === 0) return history;
  const parts: ToolResultPart[] = results.map(r => ({
    type: 'tool_result',
    toolUseId: r.toolUseId,
    content: r.content,
    isError: r.isError,
  }));
  return [...history, { role: 'user', content: parts }];
}

/**
 * Streaming assembly: fold AgentEvents into a single assistant Message.
 *
 * Accepts the sequence of provider events for one turn and returns the
 * finalised assistant Message plus token-use totals. Partial tool-call
 * JSON deltas are concatenated and parsed at toolcall_end.
 */
export interface AssembledTurn {
  message: Message;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export function assembleTurn(events: AgentEvent[]): AssembledTurn {
  const parts: ContentPart[] = [];
  let textBuf = '';
  let thinkingBuf = '';
  const toolJsonBuf = new Map<string, { name: string; json: string }>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  const flushText = () => {
    if (textBuf.length > 0) {
      parts.push({ type: 'text', text: textBuf });
      textBuf = '';
    }
  };
  const flushThinking = () => {
    if (thinkingBuf.length > 0) {
      parts.push({ type: 'thinking', text: thinkingBuf });
      thinkingBuf = '';
    }
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'text_delta': textBuf += ev.delta; break;
      case 'text_end': flushText(); break;
      case 'thinking_delta': thinkingBuf += ev.delta; break;
      case 'thinking_end': flushThinking(); break;
      case 'toolcall_start':
        flushText();
        flushThinking();
        toolJsonBuf.set(ev.id, { name: ev.name, json: '' });
        break;
      case 'toolcall_delta': {
        const entry = toolJsonBuf.get(ev.id);
        if (entry) entry.json += ev.deltaJson;
        break;
      }
      case 'toolcall_end': {
        const entry = toolJsonBuf.get(ev.id);
        const input = ev.input ?? (entry ? safeParse(entry.json) : {});
        parts.push({ type: 'tool_use', id: ev.id, name: entry?.name ?? '', input });
        toolJsonBuf.delete(ev.id);
        break;
      }
      case 'usage':
        inputTokens += ev.inputTokens;
        outputTokens += ev.outputTokens;
        cachedTokens += ev.cachedTokens ?? 0;
        break;
    }
  }
  flushText();
  flushThinking();

  return {
    message: { role: 'assistant', content: parts },
    inputTokens,
    outputTokens,
    cachedTokens,
  };
}

function safeParse(json: string): unknown {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

/** Rough cl100k heuristic: ~4 characters per token. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
