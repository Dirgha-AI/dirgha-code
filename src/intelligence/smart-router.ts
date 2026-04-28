/**
 * Smart router: chooses a cheap model for short, non-code questions
 * and the default model otherwise. Heuristic-driven; deterministic and
 * cheap enough to run per turn.
 */

import type { Message, ContentPart } from '../kernel/types.js';

export interface SmartRouterConfig {
  enabled: boolean;
  cheapModel: string;
  defaultModel: string;
  maxCheapChars?: number;
  maxCheapWords?: number;
}

export interface RouteDecision {
  model: string;
  reason: string;
}

export interface SmartRouter {
  route(messages: Message[]): RouteDecision;
}

const TOOL_INTENT_KEYWORDS = [
  'edit', 'create', 'delete', 'run', 'install', 'refactor', 'fix',
  'open', 'write', 'test', 'deploy', 'commit', 'push', 'merge',
];

export function createSmartRouter(cfg: SmartRouterConfig): SmartRouter {
  return {
    route(messages) {
      if (!cfg.enabled) {
        return { model: cfg.defaultModel, reason: 'router disabled' };
      }
      const latestUser = latestUserMessage(messages);
      if (!latestUser) {
        return { model: cfg.defaultModel, reason: 'no user message' };
      }
      const text = extractText(latestUser);
      if (looksComplex(text, cfg)) {
        return { model: cfg.defaultModel, reason: 'message looks complex' };
      }
      return { model: cfg.cheapModel, reason: 'short + no code/tool signals' };
    },
  };
}

function latestUserMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i];
  }
  return undefined;
}

function extractText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  return (msg.content as ContentPart[])
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('');
}

function looksComplex(text: string, cfg: SmartRouterConfig): boolean {
  const maxChars = cfg.maxCheapChars ?? 160;
  const maxWords = cfg.maxCheapWords ?? 28;
  if (text.length > maxChars) return true;
  if (text.split(/\s+/).length > maxWords) return true;
  if (/```/.test(text)) return true;
  if (/\bhttps?:\/\//.test(text)) return true;
  if (/[{};]\s*$/m.test(text)) return true;
  const lower = text.toLowerCase();
  return TOOL_INTENT_KEYWORDS.some(k => lower.includes(k));
}
