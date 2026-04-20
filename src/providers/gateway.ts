/**
 * providers/gateway.ts — Dirgha Gateway provider
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse } from '../types.js';
import { normaliseOpenAI } from './normalise.js';
import { getToken } from '../utils/credentials.js';
import { getGatewayUrl } from '../utils/security-boundary.js';

/**
 * Dirgha gateway only accepts {role: user|assistant|system, content: string}.
 * Flatten Anthropic content-block arrays to plain text and drop tool messages.
 */
function sanitizeForGateway(messages: Message[]): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    const role = msg.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
    let text: string;
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Only keep text blocks; skip tool_use and tool_result
      text = (msg.content as any[])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text ?? '')
        .join('');
      if (!text) continue; // skip pure-tool turns
    } else {
      continue;
    }
    result.push({ role, content: text });
  }
  return result;
}

export async function callGateway(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void
): Promise<ModelResponse> {
  const resolvedGateway = process.env['DIRGHA_GATEWAY_URL'] ?? getGatewayUrl();
  if (!resolvedGateway) {
    throw new Error(
      'No gateway URL configured.\n' +
      'Set DIRGHA_GATEWAY_URL or run: dirgha login\n' +
      'For BYOK mode, set ANTHROPIC_API_KEY / FIREWORKS_API_KEY instead.'
    );
  }
  const base = resolvedGateway.replace(/\/+$/, '');
  // Auth resolution: API key → explicit DIRGHA_TOKEN env → persisted credentials.json token
  const token = process.env['DIRGHA_API_KEY'] ?? process.env['DIRGHA_TOKEN'] ?? getToken() ?? '';

  if (!token) {
    throw new Error(
      'No auth token found. Run: dirgha login  OR  set ANTHROPIC_API_KEY / FIREWORKS_API_KEY etc.'
    );
  }

  const sanitized = sanitizeForGateway(messages);
  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...sanitized],
    tools: toOpenAITools(),
    tool_choice: 'auto',
    stream: !!onStream,
  };

  // Use streaming if callback provided
  if (onStream) {
    let fullText = '';
    await streamJSON(`${base}/api/cli/completions`, {
      Authorization: `Bearer ${token}`,
    }, payload, (text) => {
      fullText += text;
      onStream(text);
    });
    return {
      content: [{ type: 'text', text: fullText }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const data = await postJSON(`${base}/api/cli/completions`, {
    Authorization: `Bearer ${token}`,
  }, payload);

  return normaliseOpenAI(data);
}
