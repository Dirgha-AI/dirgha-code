/**
 * Shared OpenAI-compatible /chat/completions streaming adapter.
 *
 * Most providers (NIM, OpenRouter, OpenAI, local model runners) speak the
 * same SSE wire format: a stream of `data: {...}` lines carrying chat
 * completion deltas, terminated by `data: [DONE]`. This file parses that
 * stream into canonical AgentEvents. All provider adapters that speak the
 * OpenAI-compatible dialect use this helper; they differ only in base
 * URL, model roster, and per-model request shaping.
 */
import type { AgentEvent, Message, ToolDefinition } from '../kernel/types.js';
export interface OpenAICompatCallOptions {
    providerName: string;
    endpoint: string;
    apiKey: string;
    model: string;
    messages: Message[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    toolChoice?: 'auto' | 'required' | 'none';
    extraHeaders?: Record<string, string>;
    extraBody?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
    sanitizeToolDescriptions?: (desc: string) => string;
    includeThinking?: boolean;
}
export declare function streamChatCompletions(opts: OpenAICompatCallOptions): AsyncIterable<AgentEvent>;
