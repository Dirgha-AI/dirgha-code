/**
 * Cost tracker smoke. Locks down `intelligence/cost.ts`:
 *   - record() converts UsageTotal × PricePoint into USD correctly
 *   - sessionTotal() sums across multiple records for the same session
 *     and ignores other sessions
 *   - dailyTotal() sums every record whose timestamp falls on the
 *     given date prefix
 *   - budget() reports used / remaining / withinBudget against a cap
 *   - unknown provider/model yields zero cost (graceful fallback)
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { createCostTracker } = await import(_toUrl(_join(ROOT, 'intelligence/cost.js')).href);
const { findPrice } = await import(_toUrl(_join(ROOT, 'intelligence/prices.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const usage = (i, o, c = 0) => ({ inputTokens: i, outputTokens: o, cachedTokens: c, costUsd: 0 });

console.log('\n=== cost: record() converts to USD ===');
const tracker = createCostTracker();
const price = findPrice('anthropic', 'claude-opus-4-7');
check('found Anthropic Opus 4.7 price', price !== undefined);

const rec = tracker.record('anthropic', 'claude-opus-4-7', usage(1_000_000, 500_000), 'sess-A');
const expected = 1 * (price?.inputPerM ?? 0) + 0.5 * (price?.outputPerM ?? 0);
check('cost matches input/output * per-M', Math.abs(rec.costUsd - expected) < 1e-9, `got ${rec.costUsd}, want ${expected}`);
check('record carries session id',         rec.sessionId === 'sess-A');
check('record carries timestamp',          /\d{4}-\d{2}-\d{2}T/.test(rec.ts));

console.log('\n=== cost: sessionTotal() sums + isolates by session ===');
tracker.record('anthropic', 'claude-opus-4-7', usage(2_000_000, 1_000_000), 'sess-A');
tracker.record('anthropic', 'claude-opus-4-7', usage(1_000_000, 1_000_000), 'sess-B');

const totalA = tracker.sessionTotal('sess-A');
check('sess-A inputTokens summed',         totalA.inputTokens === 3_000_000);
check('sess-A outputTokens summed',        totalA.outputTokens === 1_500_000);
check('sess-A cost summed',                totalA.costUsd > 0);

const totalB = tracker.sessionTotal('sess-B');
check('sess-B not contaminated by A',      totalB.inputTokens === 1_000_000);

console.log('\n=== cost: dailyTotal() picks today by default ===');
const today = tracker.dailyTotal();
check('daily total covers all 3 records',  today.inputTokens === 4_000_000);
const yesterday = tracker.dailyTotal('1999-01-01');
check('daily total empty for past date',   yesterday.inputTokens === 0 && yesterday.costUsd === 0);

console.log('\n=== cost: budget() reports within / over ===');
const usedA = totalA.costUsd;
const within = tracker.budget('sess-A', usedA + 10);
check('within budget when cap > used',     within.withinBudget === true);
check('remaining = cap - used',            Math.abs(within.remaining - 10) < 1e-9);

const over = tracker.budget('sess-A', usedA - 5);
check('over budget when cap < used',       over.withinBudget === false);
check('remaining clamps at zero',          over.remaining === 0);

console.log('\n=== cost: unknown model = zero cost (graceful) ===');
const t2 = createCostTracker();
const unknown = t2.record('mystery', 'mystery-model', usage(10_000_000, 10_000_000), 'sess-X');
check('unknown model yields zero cost',    unknown.costUsd === 0);
check('tokens still recorded',             unknown.inputTokens === 10_000_000);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
