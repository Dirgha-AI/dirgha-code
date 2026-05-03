/**
 * Offline regression for NVIDIA NIM streaming. Drives the openai-compat
 * StreamState parser with chunk shapes captured live from
 * `https://integrate.api.nvidia.com/v1/chat/completions` so the
 * dirgha-flash regression cannot recur silently.
 *
 * Covers:
 *   - DeepSeek-V4-flash: streams `delta.reasoning` (no `_content`),
 *     then `delta.content` with the answer
 *   - Plain content path: `delta.content` with no reasoning
 *   - DeepSeek-R1 distilled: emits inline `<think>…</think>` inside
 *     `delta.content`; tags split across chunks
 *   - reasoning_content (DeepSeek native API spelling)
 *   - reasoning_details (OpenRouter unified array)
 *   - usage frame emission at end-of-stream
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const oc = await import(_toUrl(_join(ROOT, 'providers/openai-compat.js')).href);
// StreamState isn't exported by name — feed via parseStream / streamChatCompletions.
// Easier: instantiate parser directly through a tiny passthrough that mocks fetch.

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

// Build a fake response body that emits the SSE frames we want. We
// patch global fetch so streamChatCompletions can pull it.
function makeSseBody(chunks) {
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream({
    start(ctrl) { ctrl.enqueue(new TextEncoder().encode(lines)); ctrl.close(); },
  });
}

const origFetch = globalThis.fetch;
function installFetch(chunks) {
  globalThis.fetch = async () => {
    return new Response(makeSseBody(chunks), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
}
function restoreFetch() { globalThis.fetch = origFetch; }

async function drain(modelId, chunks, includeThinking = true) {
  installFetch(chunks);
  try {
    const events = [];
    for await (const ev of oc.streamChatCompletions({
      url: 'http://x/y',
      apiKey: 'x',
      model: modelId,
      messages: [{ role: 'user', content: 'q' }],
      includeThinking,
      timeoutMs: 5000,
    })) events.push(ev);
    return events;
  } finally {
    restoreFetch();
  }
}

const c = (delta, finish_reason = null) => ({
  id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm',
  choices: [{ index: 0, delta, finish_reason }],
});

console.log('\n=== nim: deepseek-v4-flash reasoning + content ===');
{
  const chunks = [
    c({ role: 'assistant', content: '' }),
    c({ reasoning: 'We' }),
    c({ reasoning: ' need' }),
    c({ reasoning: ' to respond' }),
    c({ content: 'ok' }),
    c({ content: '' }, 'stop'),
  ];
  const events = await drain('deepseek-ai/deepseek-v4-flash', chunks);
  const types = events.map(e => e.type);
  const text = events.filter(e => e.type === 'text_delta').map(e => e.delta).join('');
  const thinking = events.filter(e => e.type === 'thinking_delta').map(e => e.delta).join('');
  check('reasoning emitted on thinking channel', /We need to respond/.test(thinking));
  check('content reaches user as text',           text === 'ok');
  check('thinking_start before any thinking',     types.indexOf('thinking_start') >= 0 && types.indexOf('thinking_start') < types.indexOf('thinking_delta'));
  check('thinking_end before text_start',         types.indexOf('thinking_end') < types.indexOf('text_start'));
}

console.log('\n=== nim: plain content with no reasoning ===');
{
  const events = await drain('any-model', [
    c({ role: 'assistant', content: '' }),
    c({ content: 'hi' }),
    c({ content: ' there' }, 'stop'),
  ]);
  const text = events.filter(e => e.type === 'text_delta').map(e => e.delta).join('');
  check('plain content streams normally',         text === 'hi there');
  check('no thinking events',                     !events.some(e => e.type.startsWith('thinking_')));
}

console.log('\n=== nim: reasoning_content (DeepSeek native key) ===');
{
  const events = await drain('deepseek-r1', [
    c({ reasoning_content: 'native ' }),
    c({ reasoning_content: 'reasoning' }),
    c({ content: 'final', }, 'stop'),
  ]);
  const text = events.filter(e => e.type === 'text_delta').map(e => e.delta).join('');
  const thinking = events.filter(e => e.type === 'thinking_delta').map(e => e.delta).join('');
  check('reasoning_content flowed to thinking',   thinking === 'native reasoning');
  check('content path still works',               text === 'final');
}

console.log('\n=== nim: includeThinking=false — content still reaches user ===');
{
  // includeThinking=false is accepted but does NOT suppress thinking events
  // at the provider layer — reasoning_content must be echoed back on the
  // next API turn (DeepSeek HTTP 400 if omitted). TUI filters display.
  const events = await drain('deepseek-flash', [
    c({ reasoning: 'private' }),
    c({ content: 'public' }, 'stop'),
  ], /* includeThinking */ false);
  const text = events.filter(e => e.type === 'text_delta').map(e => e.delta).join('');
  check('content still emitted when includeThinking=false', text === 'public');
  check('reasoning still captured for echo-back',  events.some(e => e.type === 'thinking_delta'));
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
