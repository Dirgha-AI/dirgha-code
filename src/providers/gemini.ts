/** providers/gemini.ts — Google Gemini via generateContent API */
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { AuthError } from '../types.js';
import { toOpenAITools } from './tools-format.js';
import { toGeminiMessages } from './messages.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function toGeminiTools() {
  return [{
    functionDeclarations: toOpenAITools().map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }];
}

export async function callGemini(
  messages: Message[], systemPrompt: string, model: string,
  onStream?: (t: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (!apiKey) throw new AuthError('GEMINI_API_KEY not set. Run: dirgha keys set GEMINI_API_KEY ...');

  const endpoint = onStream
    ? `${BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`
    : `${BASE}/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiMessages(messages),
    tools: toGeminiTools(),
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 8192 },
  };

  if (onStream) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) throw new AuthError();
    if (!res.ok || !res.body) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`); }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let textAccum = '';
    const toolCalls: ContentBlock[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          for (const cand of chunk?.candidates ?? []) {
            for (const part of cand?.content?.parts ?? []) {
              if (part.text) { textAccum += part.text; onStream(part.text); }
              if (part.functionCall) {
                toolCalls.push({ type: 'tool_use', id: `gemini-${Date.now()}`, name: part.functionCall.name, input: part.functionCall.args ?? {} });
              }
            }
          }
        } catch { /* skip */ }
      }
    }

    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    content.push(...toolCalls);
    return { content };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json() as any;

  const content: ContentBlock[] = [];
  for (const cand of data?.candidates ?? []) {
    for (const part of cand?.content?.parts ?? []) {
      if (part.text) content.push({ type: 'text', text: part.text });
      if (part.functionCall) {
        content.push({ type: 'tool_use', id: `gemini-${Date.now()}`, name: part.functionCall.name, input: part.functionCall.args ?? {} });
      }
    }
  }
  const meta = data?.usageMetadata;
  return { content, usage: meta ? { input_tokens: meta.promptTokenCount ?? 0, output_tokens: meta.candidatesTokenCount ?? 0 } : undefined };
}
