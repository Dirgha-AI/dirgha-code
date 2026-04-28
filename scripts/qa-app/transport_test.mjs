/**
 * Transport-abstraction parity test.
 *
 * Proves that the OpenAI-compat wire protocol is fully expressed as a
 * data blob (`OpenAICompatSpec`), so adding a new provider is a config
 * change rather than a new class. We:
 *   1. Construct each preset via `fromPreset(...)` with a dummy key.
 *   2. Assert it implements the Provider interface.
 *   3. Assert tool-support / thinking-support detectors fire for the
 *      right model ids.
 *   4. Show that a brand-new provider (e.g. "lambda-labs") is one
 *      preset literal away.
 *
 * No network: we never call .stream(); we only inspect the metadata.
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const presets = await import(_toUrl(_join(ROOT, 'providers/presets.js')).href);
const { defineOpenAICompatProvider } = await import(_toUrl(_join(ROOT, 'providers/define-openai-compat.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== preset registry ===');

const names = Object.keys(presets.PRESETS);
check('5 presets defined (openai/openrouter/nvidia/fireworks/deepseek)', names.length === 5, names.join(','));

console.log('\n=== fromPreset with dummy key ===');

// Set a dummy key so the constructor doesn't throw on the env-required check.
process.env.OPENAI_API_KEY = 'sk-dummy';
process.env.OPENROUTER_API_KEY = 'or-dummy';
process.env.NVIDIA_API_KEY = 'nv-dummy';
process.env.FIREWORKS_API_KEY = 'fw-dummy';
process.env.DEEPSEEK_API_KEY = 'ds-dummy';

for (const name of names) {
  const p = presets.fromPreset(presets.PRESETS[name]);
  check(`preset/${name} produces a Provider`, p && p.id === name && typeof p.stream === 'function');
}

console.log('\n=== capability detectors ===');

const openai = presets.fromPreset(presets.OPENAI_PRESET);
check('openai supportsTools(gpt-5)',          openai.supportsTools('gpt-5') === true);
check('openai supportsThinking(o1)',          openai.supportsThinking('o1') === true);
check('openai supportsThinking(gpt-5)',       openai.supportsThinking('gpt-5') === false);
check('openai supportsThinking(o3-mini)',     openai.supportsThinking('o3-mini') === true);

const or = presets.fromPreset(presets.OPENROUTER_PRESET);
check('OR supportsTools(deepseek/r1)',        or.supportsTools('deepseek/deepseek-r1') === true);
check('OR supportsTools(tencent/hy3:free)',   or.supportsTools('tencent/hy3-preview:free') === true);
check('OR supportsTools(unknown/foo)',        or.supportsTools('unknown/foo') === false);

const nim = presets.fromPreset(presets.NVIDIA_PRESET);
check('NVIDIA supportsTools(kimi-k2-instruct)', nim.supportsTools('moonshotai/kimi-k2-instruct') === true);
check('NVIDIA supportsTools(unsupported)',    nim.supportsTools('moonshotai/kimi-k2-foo') === false);

console.log('\n=== adding a NEW provider as a config blob ===');

const lambdaLabsPreset = {
  id: 'lambda',
  defaultBaseUrl: 'https://api.lambdalabs.com/v1',
  apiKeyEnv: 'LAMBDA_API_KEY',
  defaultTimeoutMs: 90_000,
  supportsTools: () => true,
};
process.env.LAMBDA_API_KEY = 'lambda-dummy';
const lambda = presets.fromPreset(lambdaLabsPreset);
check('new provider id matches preset',       lambda.id === 'lambda');
check('new provider stream is a function',    typeof lambda.stream === 'function');
check('new provider supportsTools default',   lambda.supportsTools('any-model') === true);

console.log('\n=== missing key throws cleanly ===');

delete process.env.LAMBDA_API_KEY;
let threw;
try { presets.fromPreset(lambdaLabsPreset); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
check('missing env-key surfaces as error',     /required/i.test(threw ?? ''));

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
