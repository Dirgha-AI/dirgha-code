/**
 * Model registry — `prices.ts` is the single source of truth for
 * id → (provider, prices, contextWindow, maxOutput, supportsTools,
 * supportsThinking, family). Every consumer (cost, context-aware
 * compaction, model picker, presets) reads from here.
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { PRICES, lookupModel, modelsByFamily, contextWindowFor, findPrice } = await import(_toUrl(_join(ROOT, 'intelligence/prices.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== registry shape ===');
check('PRICES is non-empty',           PRICES.length > 0);
check('PRICES rows have provider+model', PRICES.every(p => p.provider && p.model));
check('PRICES rows have prices',       PRICES.every(p => typeof p.inputPerM === 'number' && typeof p.outputPerM === 'number'));

console.log('\n=== lookupModel ===');
const kimi = lookupModel('moonshotai/kimi-k2-instruct');
check('lookupModel hit for kimi',       kimi?.provider === 'nvidia');
check('lookupModel miss returns undef', lookupModel('not-a-model') === undefined);

console.log('\n=== contextWindowFor ===');
check('Kimi K2 has 128k context',       contextWindowFor('moonshotai/kimi-k2-instruct') === 128_000);
check('Gemini 2.5 Pro has 2M context',  contextWindowFor('gemini-2.5-pro') === 2_000_000);
check('unknown model gets default',     contextWindowFor('unknown/foo') === 32_000);

console.log('\n=== modelsByFamily ===');
const families = modelsByFamily();
check('returns a Map',                  families instanceof Map);
check('Anthropic family present',       families.has('claude') && families.get('claude').length >= 3);
check('OpenAI family includes gpt-5',   families.get('gpt')?.some(p => p.model === 'gpt-5'));
check('Kimi family non-empty',          (families.get('kimi') ?? []).length > 0);
check('every model in some family',     [...families.values()].flat().length === PRICES.length);
check('no model in two families',       new Set([...families.values()].flat().map(p => p.model)).size === PRICES.length);

console.log('\n=== findPrice (provider-scoped) ===');
const fp = findPrice('nvidia', 'moonshotai/kimi-k2-instruct');
check('findPrice resolves cheap path',  fp?.inputPerM === 0.15);
const wrongProvider = findPrice('openai', 'moonshotai/kimi-k2-instruct');
check('findPrice respects provider',    wrongProvider === undefined);

console.log('\n=== capability flags (when populated) ===');
// Not all rows have supportsTools/Thinking yet; this test passes
// regardless and just reports population coverage.
const withTools = PRICES.filter(p => p.supportsTools !== undefined).length;
const withThinking = PRICES.filter(p => p.supportsThinking !== undefined).length;
console.log(`  ${PRICES.length} rows total · ${withTools} declare supportsTools · ${withThinking} declare supportsThinking`);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
