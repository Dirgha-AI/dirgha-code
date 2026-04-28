/**
 * Rate-limiting middleware smoke. Decorates a mock provider with
 * `withRateLimit` and verifies:
 *   - bursting up to `burst` tokens succeeds without delay
 *   - the (burst+1)-th call within the same instant blocks/waits
 *   - exceeding maxWaitMs throws a ProviderError with status=429
 *   - bucket refills at `rps` tokens-per-second (within tolerance)
 *   - multiple decorators with the same (id,rps,burst) share the bucket
 *   - decorator does not corrupt the inner stream output
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { withRateLimit, bucketSnapshot, _resetAllBuckets } = await import(_toUrl(_join(ROOT, 'providers/rate-limiter.js')).href);
const { ProviderError } = await import(_toUrl(_join(ROOT, 'providers/iface.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const drain = async (gen) => { const out = []; for await (const ev of gen) out.push(ev); return out; };

function makeMock(id) {
  let calls = 0;
  return {
    id,
    supportsTools: () => true,
    supportsThinking: () => false,
    calls: () => calls,
    async *stream() {
      calls++;
      yield { type: 'text_delta', delta: 'ok' };
      yield { type: 'turn_end', turnId: `t${calls}`, stopReason: 'end_turn' };
    },
  };
}

console.log('\n=== rate-limit: burst goes through, then back-pressure kicks in ===');
_resetAllBuckets();
{
  const mock = makeMock('p1');
  const limited = withRateLimit(mock, { rps: 2, burst: 3, maxWaitMs: 50 });
  const t0 = Date.now();
  await drain(limited.stream({ model: 'm', messages: [] }));
  await drain(limited.stream({ model: 'm', messages: [] }));
  await drain(limited.stream({ model: 'm', messages: [] }));
  const tBurst = Date.now() - t0;
  check('3 calls within burst are fast (<150ms)', tBurst < 150, `${tBurst}ms`);
  check('mock saw all 3 calls',                    mock.calls() === 3);
}

console.log('\n=== rate-limit: 4th call blocks, throws after maxWaitMs ===');
_resetAllBuckets();
{
  const mock = makeMock('p2');
  const limited = withRateLimit(mock, { rps: 1, burst: 1, maxWaitMs: 50 });
  await drain(limited.stream({ model: 'm', messages: [] })); // consumes the only token
  const t0 = Date.now();
  let threw = null;
  try { await drain(limited.stream({ model: 'm', messages: [] })); }
  catch (err) { threw = err; }
  const dt = Date.now() - t0;
  check('over-budget call rejects',                 threw instanceof Error);
  check('rejection is a ProviderError(429)',         threw instanceof ProviderError && threw.status === 429);
  check('rejection is marked retryable',            threw?.retryable === true);
  // Fail-fast: when the deficit can't possibly be paid down inside
  // maxWaitMs, throw immediately rather than blocking the caller.
  check('rejection is fast (fail-fast on impossibility)', dt < 50, `${dt}ms`);
  check('inner provider not called twice',          mock.calls() === 1);
}

console.log('\n=== rate-limit: bucket refills over time ===');
_resetAllBuckets();
{
  const mock = makeMock('p3');
  const limited = withRateLimit(mock, { rps: 5, burst: 1, maxWaitMs: 1000 });
  await drain(limited.stream({ model: 'm', messages: [] }));
  const t0 = Date.now();
  await drain(limited.stream({ model: 'm', messages: [] })); // should wait ~200 ms
  const dt = Date.now() - t0;
  check('refill let second call through',          mock.calls() === 2);
  // Allow some slop above and below 200 ms
  check('refill latency is ≈1/rps (150–400ms)',     dt >= 150 && dt <= 400, `${dt}ms`);
}

console.log('\n=== rate-limit: shared bucket across decorators with same key ===');
_resetAllBuckets();
{
  const mockA = makeMock('shared');
  const mockB = makeMock('shared');
  const limA = withRateLimit(mockA, { rps: 1, burst: 1, maxWaitMs: 30 });
  const limB = withRateLimit(mockB, { rps: 1, burst: 1, maxWaitMs: 30 });
  await drain(limA.stream({ model: 'm', messages: [] })); // takes shared token
  let threw = null;
  try { await drain(limB.stream({ model: 'm', messages: [] })); }
  catch (err) { threw = err; }
  check('B blocked because A drained the shared bucket', threw instanceof ProviderError);
}

console.log('\n=== rate-limit: stream output is untouched ===');
_resetAllBuckets();
{
  const mock = makeMock('p5');
  const limited = withRateLimit(mock, { rps: 100, burst: 100 });
  const out = await drain(limited.stream({ model: 'm', messages: [] }));
  check('still emits text_delta',                   out.some(e => e.type === 'text_delta' && e.delta === 'ok'));
  check('still emits turn_end',                     out.some(e => e.type === 'turn_end'));
}

console.log('\n=== rate-limit: bucketSnapshot reflects state ===');
_resetAllBuckets();
{
  const mock = makeMock('p6');
  const limited = withRateLimit(mock, { rps: 2, burst: 4 });
  const before = bucketSnapshot('p6', { rps: 2, burst: 4 });
  check('initial tokens = capacity',                Math.round(before.tokens) === 4 && before.capacity === 4);
  await drain(limited.stream({ model: 'm', messages: [] }));
  const after = bucketSnapshot('p6', { rps: 2, burst: 4 });
  check('after one call tokens decremented',        after.tokens < before.tokens);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
