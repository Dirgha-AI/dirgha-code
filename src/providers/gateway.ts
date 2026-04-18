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
 * Block the "DIRGHA_GATEWAY_URL=https://evil.com" exploit. Any scheme other
 * than https is rejected unless the host is clearly local (localhost,
 * 127.0.0.1, ::1). This way a shell-rc injection can't silently exfiltrate
 * the Bearer token to an attacker-controlled endpoint.
 */
function assertSafeGatewayUrl(url: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`DIRGHA_GATEWAY_URL is not a valid URL: ${url}`); }
  const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  if (u.protocol === 'https:') return;
  if (u.protocol === 'http:' && isLocal) return;
  throw new Error(
    `DIRGHA_GATEWAY_URL must use https:// (got ${u.protocol}//${u.hostname}). ` +
    `Refusing to send Bearer token to a non-TLS or non-local endpoint.`
  );
}

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
  // Guard against a hijacked DIRGHA_GATEWAY_URL that would exfiltrate the
  // Bearer token. Require https:// (or localhost/127.0.0.1 for dev). Anything
  // else throws before the token is attached to the fetch.
  assertSafeGatewayUrl(resolvedGateway);
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
    await streamJSON(`${base}/api/chat/completions`, {
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

  const data = await postJSON(`${base}/api/chat/completions`, {
    Authorization: `Bearer ${token}`,
  }, payload);

  return normaliseOpenAI(data);
}
