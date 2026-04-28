/**
 * Multi-provider smoke matrix.
 *
 * For every model in PRICES, run two smokes:
 *   1. chat:  pure prompt → assert reply contains a non-empty token
 *   2. tool:  bash echo → assert tool ran AND model summarised
 *
 * Skips gracefully when the provider's API key isn't in the env.
 * Outputs a markdown table to stdout + a JSON report to
 * /tmp/provider-matrix.json.
 *
 * Run nightly in CI:
 *   node scripts/qa-app/provider_matrix.mjs
 *   exit 0 = every reachable model passed; non-zero = at least one
 *   model regressed (skipped models don't count as failures).
 *
 * Caps: --only=<provider> filter, --max=<N> per-provider, --skip-tools
 * to do chat-only, --timeout-ms=<N> per call.
 */

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { runAgentLoop } = await import(_toUrl(_join(ROOT, 'kernel/agent-loop.js')).href);
const { createEventStream } = await import(_toUrl(_join(ROOT, 'kernel/event-stream.js')).href);
const { ProviderRegistry } = await import(_toUrl(_join(ROOT, 'providers/index.js')).href);
const { builtInTools, createToolRegistry, createToolExecutor } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);
const { PRICES } = await import(_toUrl(_join(ROOT, 'intelligence/prices.js')).href);

// CLI flags (very small parser; this is a test script)
const flags = Object.fromEntries(
  process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).filter(p => p.length === 2),
);
const onlyProvider = flags.only;
const maxPerProvider = flags.max ? Number(flags.max) : Infinity;
const skipTools = process.argv.includes('--skip-tools');
const timeoutMs = flags['timeout-ms'] ? Number(flags['timeout-ms']) : 60_000;

const PROVIDER_KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const sandbox = mkdtempSync(join(tmpdir(), 'matrix-'));
process.chdir(sandbox);

const providers = new ProviderRegistry();
const registry = createToolRegistry(builtInTools);
const sanitized = registry.sanitize({ descriptionLimit: 200 });

async function smoke(model, kind) {
  // Build a minimal turn. Chat: no tools, just plain text.
  // Tool: ask the model to call shell tool, fail if it doesn't.
  const messages = kind === 'chat'
    ? [{ role: 'user', content: 'Reply with the single word OK.' }]
    : [{ role: 'user', content: 'Call the shell tool with {"command":"echo MATRIX_OK"}. Then reply with the word DONE.' }];

  const events = createEventStream();
  let assistantText = '';
  let toolExecCount = 0;
  let toolHadOk = false;
  let kernelErr;
  events.subscribe(ev => {
    if (ev.type === 'text_delta') assistantText += ev.delta;
    if (ev.type === 'tool_exec_end') {
      toolExecCount++;
      if (!ev.isError && /MATRIX_OK/.test(ev.output ?? '')) toolHadOk = true;
    }
    if (ev.type === 'error') kernelErr = ev.message;
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  let provider;
  try {
    provider = providers.forModel(model);
  } catch (err) {
    return { ok: false, kind, error: `forModel: ${err instanceof Error ? err.message : err}`, durationMs: 0 };
  }

  const executor = createToolExecutor({ registry, cwd: sandbox, sessionId: `matrix-${Date.now()}` });
  const t0 = Date.now();
  let stopReason = '?';
  let err;
  try {
    const r = await runAgentLoop({
      sessionId: `matrix-${Date.now()}`,
      model,
      messages,
      tools: kind === 'tool' ? sanitized.definitions : [],
      maxTurns: 4,
      provider,
      toolExecutor: executor,
      events,
      signal: ctrl.signal,
    });
    stopReason = r.stopReason;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(t);
  }
  const durationMs = Date.now() - t0;

  if (err) return { ok: false, kind, error: err, durationMs, stopReason };
  // Surface the kernel's `error` event (provider 4xx/5xx etc.) so the
  // matrix output explains why a model failed instead of just "error".
  const errorOut = kernelErr ?? (stopReason === 'error' ? 'unknown kernel error' : undefined);
  if (kind === 'chat') {
    const ok = assistantText.trim().length > 0 && stopReason !== 'error';
    return { ok, kind, durationMs, stopReason, summary: assistantText.trim().slice(0, 80), ...(errorOut ? { error: errorOut } : {}) };
  }
  const ok = toolExecCount >= 1 && toolHadOk && stopReason !== 'error';
  return { ok, kind, durationMs, stopReason, toolExecCount, toolHadOk, summary: assistantText.trim().slice(0, 80), ...(errorOut ? { error: errorOut } : {}) };
}

// Bucket models by provider for the report
const byProvider = new Map();
for (const p of PRICES) {
  if (onlyProvider && p.provider !== onlyProvider) continue;
  if (!byProvider.has(p.provider)) byProvider.set(p.provider, []);
  if (byProvider.get(p.provider).length < maxPerProvider) byProvider.get(p.provider).push(p.model);
}

const results = [];
for (const [providerName, models] of byProvider) {
  const env = PROVIDER_KEY_ENV[providerName];
  if (env && !process.env[env]) {
    for (const model of models) {
      results.push({ provider: providerName, model, chat: { skipped: `${env} unset` }, tool: { skipped: `${env} unset` } });
    }
    continue;
  }
  for (const model of models) {
    process.stdout.write(`\n→ ${providerName}/${model}\n`);
    const chat = await smoke(model, 'chat');
    process.stdout.write(`  chat: ${chat.ok ? '✓' : '✗'} ${chat.durationMs}ms ${chat.summary ?? chat.error ?? ''}\n`);
    let tool = { skipped: 'skip-tools flag' };
    if (!skipTools) {
      tool = await smoke(model, 'tool');
      process.stdout.write(`  tool: ${tool.ok ? '✓' : '✗'} ${tool.durationMs}ms ${tool.summary ?? tool.error ?? ''}\n`);
    }
    results.push({ provider: providerName, model, chat, tool });
  }
}

// Markdown summary
process.stdout.write('\n\n## Provider matrix\n\n');
process.stdout.write('| Provider | Model | Chat | Tool |\n');
process.stdout.write('|---|---|---|---|\n');
let hardFail = 0;
let totalRun = 0;
for (const r of results) {
  const cell = (s) => {
    if (s.skipped) return `– skipped (${s.skipped})`;
    if (s.ok) return `✓ ${s.durationMs}ms`;
    hardFail++;
    return `✗ ${(s.error ?? s.stopReason ?? 'fail').slice(0, 40)}`;
  };
  if (!r.chat.skipped) totalRun++;
  if (!r.tool.skipped) totalRun++;
  process.stdout.write(`| ${r.provider} | \`${r.model}\` | ${cell(r.chat)} | ${cell(r.tool)} |\n`);
}
process.stdout.write(`\n${results.length} models considered, ${totalRun} smokes ran, ${hardFail} hard failures.\n`);

writeFileSync('/tmp/provider-matrix.json', JSON.stringify(results, null, 2));
process.stdout.write('full report: /tmp/provider-matrix.json\n');
process.exit(hardFail === 0 ? 0 : 1);
