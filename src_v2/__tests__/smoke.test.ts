/**
 * Integration smoke: builds a tiny agent session end-to-end using the
 * mock parity server so we can assert that kernel → providers → tools
 * compose cleanly without external network calls.
 */

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { createEventStream } from '../kernel/event-stream.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import { NvidiaProvider } from '../providers/nvidia.js';
import { createToolRegistry, createToolExecutor, builtInTools } from '../tools/index.js';
import { startMockOpenAICompat } from '../parity/mock-openai-compat.js';
import type { AgentEvent } from '../kernel/types.js';

describe('v2 integration smoke', () => {
  it('runs an end-to-end single-turn text completion through the kernel', async () => {
    const mock = await startMockOpenAICompat([
      {
        chunks: [
          JSON.stringify({ choices: [{ delta: { content: 'hello ' } }] }),
          JSON.stringify({ choices: [{ delta: { content: 'world' } }] }),
          JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          }),
          '[DONE]',
        ],
      },
    ]);

    const provider = new NvidiaProvider({ apiKey: 'test', baseUrl: mock.url, timeoutMs: 5_000 });
    const events = createEventStream();
    const registry = createToolRegistry(builtInTools);
    const cwd = mkdtempSync(join(tmpdir(), 'dirgha-smoke-'));
    const executor = createToolExecutor({ registry, cwd, sessionId: randomUUID() });
    const sanitized = registry.sanitize({ descriptionLimit: 200 });

    const collected: AgentEvent[] = [];
    events.subscribe(ev => collected.push(ev));

    const result = await runAgentLoop({
      sessionId: randomUUID(),
      model: 'moonshotai/kimi-k2-instruct',
      messages: [{ role: 'user', content: 'say hello' }],
      tools: sanitized.definitions,
      maxTurns: 1,
      provider,
      toolExecutor: executor,
      events,
    });

    await mock.close();

    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(3);
    expect(result.usage.outputTokens).toBe(2);
    const last = result.messages[result.messages.length - 1];
    expect(last.role).toBe('assistant');
    const text = typeof last.content === 'string'
      ? last.content
      : last.content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('');
    expect(text).toBe('hello world');
  });
});
