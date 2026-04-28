/**
 * Error classifier smoke. Locks down `intelligence/error-classifier.ts`:
 * every status code maps to a stable `reason`, retryable bit, and
 * shouldFallback bit. Stable input → stable output → reliable retry +
 * failover policy.
 *
 * Coverage:
 *   - HTTP status codes → reason mapping (auth/billing/404/408/413/422/429/5xx)
 *   - retryable flag per reason
 *   - shouldFallback flag per reason
 *   - body-text fallbacks (content-filter, tool-schema, context-length)
 *   - non-ProviderError fallbacks: timeout, network, unknown
 *   - backoffMs hints honored for the reasons that have one
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { createErrorClassifier } = await import(_toUrl(_join(ROOT, 'intelligence/error-classifier.js')).href);
const { ProviderError } = await import(_toUrl(_join(ROOT, 'providers/iface.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const classifier = createErrorClassifier();
const provErr = (status, msg = 'oops') => new ProviderError(msg, 'p', status);

console.log('\n=== error-classifier: HTTP status → reason ===');
const cases = [
  [401, 'auth',             false, false, undefined],
  [403, 'auth',             false, false, undefined],
  [402, 'billing',          false, true,  undefined],
  [404, 'model_not_found',  false, true,  undefined],
  [408, 'timeout',          true,  false, 1000],
  [413, 'context_overflow', false, false, undefined],
  [415, 'format_error',     false, false, undefined],
  [422, 'format_error',     false, false, undefined],
  [429, 'rate_limit',       true,  true,  4000],
  [500, 'overloaded',       true,  true,  2000],
  [503, 'overloaded',       true,  true,  3000],
  [529, 'overloaded',       true,  true,  3000],
];
for (const [status, reason, retryable, fallback, backoff] of cases) {
  const r = classifier.classify(provErr(status), 'p', 'm');
  check(`${status} ⇒ ${reason}`,        r.reason === reason, `got ${r.reason}`);
  check(`${status} retryable=${retryable}`, r.retryable === retryable);
  check(`${status} fallback=${fallback}`, r.shouldFallback === fallback);
  if (backoff !== undefined) check(`${status} backoff=${backoff}`, r.backoffMs === backoff);
}

console.log('\n=== error-classifier: body-text fallbacks within ProviderError ===');
const filter = classifier.classify(new ProviderError('Response blocked: content filter', 'p', 200), 'p', 'm');
check('content filter detected',        filter.reason === 'content_filter');

const schema = classifier.classify(new ProviderError('tool schema invalid', 'p', 200), 'p', 'm');
check('tool schema detected',           schema.reason === 'tool_schema');

const ctx = classifier.classify(new ProviderError('context length exceeded', 'p', 200), 'p', 'm');
check('context_overflow text detected', ctx.reason === 'context_overflow');

console.log('\n=== error-classifier: non-ProviderError fallbacks ===');
const timeout = classifier.classify(new Error('socket timed out'), 'p', 'm');
check('socket timeout ⇒ timeout',       timeout.reason === 'timeout' && timeout.retryable === true);

const aborted = classifier.classify(new Error('request was aborted'), 'p', 'm');
check('abort ⇒ timeout',                 aborted.reason === 'timeout');

const network = classifier.classify(new Error('ECONNREFUSED 127.0.0.1:443'), 'p', 'm');
check('ECONNREFUSED ⇒ network',          network.reason === 'network' && network.retryable === true);

const dns = classifier.classify(new Error('getaddrinfo ENOTFOUND example.org'), 'p', 'm');
check('ENOTFOUND ⇒ network',             dns.reason === 'network');

const surprise = classifier.classify(new Error('something I have never seen'), 'p', 'm');
check('unmatched ⇒ unknown',             surprise.reason === 'unknown' && surprise.retryable === false);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
