/**
 * Scripted parity scenarios. Each scenario describes a sequence of
 * inputs (messages, tool stubs) and the expected event sequence from
 * the provider adapter under test. Scenarios are format-agnostic; the
 * runner maps them onto mock HTTP servers per provider.
 */

import type { AgentEvent, Message, ToolDefinition } from '../kernel/types.js';

export interface ParityScenario {
  name: string;
  provider: 'nvidia' | 'openrouter' | 'openai' | 'anthropic' | 'gemini';
  model: string;
  request: {
    messages: Message[];
    tools?: ToolDefinition[];
  };
  /** Mock SSE response lines (without the leading `data:` prefix). */
  mockChunks: string[];
  expectedEventTypes: Array<AgentEvent['type']>;
}

export const DEFAULT_SCENARIOS: ParityScenario[] = [
  {
    name: 'streaming_text_basic',
    provider: 'nvidia',
    model: 'moonshotai/kimi-k2-instruct',
    request: {
      messages: [{ role: 'user', content: 'Say PONG' }],
    },
    mockChunks: [
      JSON.stringify({ choices: [{ delta: { content: 'PO' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'NG' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
      '[DONE]',
    ],
    expectedEventTypes: ['text_start', 'text_delta', 'text_delta', 'text_end', 'usage'],
  },
  {
    name: 'tool_call_roundtrip',
    provider: 'nvidia',
    model: 'moonshotai/kimi-k2-instruct',
    request: {
      messages: [{ role: 'user', content: 'list files' }],
      tools: [{
        name: 'fs_ls',
        description: 'List files',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      }],
    },
    mockChunks: [
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{ index: 0, id: 'call-1', function: { name: 'fs_ls', arguments: '{"path":' } }],
          },
        }],
      }),
      JSON.stringify({
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: '"."}' } }] },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }),
      '[DONE]',
    ],
    expectedEventTypes: ['toolcall_start', 'toolcall_delta', 'toolcall_delta', 'toolcall_end', 'usage'],
  },
  {
    name: 'unicode_text',
    provider: 'openrouter',
    model: 'inclusionai/ling-2.6-1t:free',
    request: {
      messages: [{ role: 'user', content: 'echo emoji' }],
    },
    mockChunks: [
      JSON.stringify({ choices: [{ delta: { content: '✨' } }] }),
      JSON.stringify({ choices: [{ delta: { content: ' done' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
      '[DONE]',
    ],
    expectedEventTypes: ['text_start', 'text_delta', 'text_delta', 'text_end', 'usage'],
  },
];
