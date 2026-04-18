/**
 * agent/commands/chat.ts — Headless chat command for agent mode.
 *
 * Routes through the provider dispatcher (providers/dispatch.ts), NOT directly
 * through the gateway. That way `--model minimaxai/minimax-m2.7` infers
 * provider=nvidia and calls NVIDIA's NIM endpoint with the user's BYOK key,
 * while `--model dirgha:kimi` still infers provider=gateway. Previously this
 * file called callGateway() unconditionally, which made BYOK providers
 * unreachable from agent mode — the user's bug report ("I tried MiniMax 2.7
 * and it didn't respond").
 */
import type { AgentOutput } from '../types.js';
import { callModel } from '../../providers/dispatch.js';
import type { Message } from '../../types.js';

export interface ChatArgs {
  message?: string;
}

export interface ChatFlags {
  model?: string;
  json?: boolean;
  'no-stream'?: boolean;
}

// Default for headless `dirgha agent chat` — NVIDIA MiniMax M2.7 via BYOK.
// Salik wants M2.7 as the default; when it's unhealthy (seen 502/timeout on
// 2026-04-18) dispatch.ts fails over to Kimi K2 on the same NVIDIA key, then
// to OpenRouter. Override per-call with `--model <id>`.
const DEFAULT_MODEL = 'minimaxai/minimax-m2.7';

export async function chatHeadless(
  args: unknown,
  flags: unknown
): Promise<AgentOutput> {
  const a = (args ?? {}) as ChatArgs & Record<string, unknown>;
  const f = (flags ?? {}) as ChatFlags & Record<string, unknown>;
  // Parser routes `--message "hi"` → flags.message and the positional after
  // the command → args.message. Accept both so these both work:
  //   dirgha agent chat --message "hi"
  //   dirgha agent chat "hi"
  const message = String(a.message ?? f.message ?? '');
  const model = String(f.model ?? DEFAULT_MODEL);
  const stream = !f['no-stream'];

  if (!message.trim()) {
    return {
      text: 'chat: empty message',
      exitCode: 1,
      command: 'chat',
      timestamp: new Date().toISOString(),
      suggestions: ['dirgha agent chat --message "your question"']
    };
  }

  const messages: Message[] = [{ role: 'user', content: message }];
  const systemPrompt = 'You are Dirgha, a concise coding assistant. Answer directly.';

  try {
    let fullText = '';
    const onStream = stream ? (t: string) => { fullText += t; } : undefined;
    const resp = await callModel(messages, systemPrompt, model, onStream);

    const text = fullText || (resp.content?.map(b => b.type === 'text' ? (b.text ?? '') : '').join('') ?? '');

    return {
      data: { response: text, model },
      text,
      exitCode: 0,
      command: 'chat',
      timestamp: new Date().toISOString(),
      suggestions: ['Use --model to specify a different model', 'Use --no-stream for non-streaming'],
      meta: {
        tokensUsed: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
        model
      }
    };
  } catch (err) {
    return {
      text: `Chat failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      exitCode: 1,
      command: 'chat',
      timestamp: new Date().toISOString(),
      suggestions: [
        'Verify the provider API key is set (NVIDIA_API_KEY, FIREWORKS_API_KEY, etc.)',
        'Run: dirgha keys list'
      ]
    };
  }
}
