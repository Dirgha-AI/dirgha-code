#!/usr/bin/env node
/**
 * Unified CLI test runner. Sequences every harness under
 * scripts/qa-app/, prints a per-suite summary, exits non-zero on any
 * failure. Suitable for `npm run test:cli` and CI.
 *
 * Suites (skipped cleanly when their environmental dependency is
 * absent — e.g. provider_matrix without an API key):
 *   1. ink_unit_test.mjs    — Ink TUI projection (no network)
 *   2. slash_audit.mjs      — every built-in slash command (no network)
 *   3. hooks_test.mjs       — kernel hooks lifecycle (needs OPENROUTER_API_KEY)
 *   4. tools_smoke.mjs      — every built-in tool (no network)
 *   5. provider_matrix.mjs  — chat + tool across catalogue (uses available keys)
 *
 * Flags:
 *   --quick           Skip provider_matrix entirely (~30s total runtime)
 *   --offline         Skip every suite that needs network (only ink + slash + tools)
 *   --only=<name>     Run a single suite by name (ink|slash|hooks|tools|matrix)
 *   --bail            Stop on first failure
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const offline = args.includes('--offline');
const bail = args.includes('--bail');
const only = (args.find(a => a.startsWith('--only='))?.split('=')[1] ?? '').toLowerCase();

const SUITES = [
  { name: 'ink',        file: 'ink_unit_test.mjs',  needs: 'none',                desc: 'Ink TUI projection' },
  { name: 'ink-ctrlc',  file: 'ink_ctrlc_queue_test.mjs', needs: 'none',          desc: 'Ctrl+C clears buffer / arms exit on empty buffer' },
  { name: 'ink-queue',  file: 'ink_queue_e2e_test.mjs',   needs: 'none',          desc: 'Prompt queue while busy: indicator, drain, FIFO' },
  { name: 'slash',      file: 'slash_audit.mjs',    needs: 'none',                desc: 'Every built-in slash command' },
  { name: 'tools',      file: 'tools_smoke.mjs',    needs: 'none',                desc: 'Every built-in tool' },
  { name: 'checkpoint', file: 'checkpoint_test.mjs',needs: 'none',                desc: 'Checkpoint save/list/restore/delete' },
  { name: 'browser',    file: 'browser_test.mjs',   needs: 'none',                desc: 'Browser tool happy path', heavy: false },
  { name: 'primer',     file: 'primer_test.mjs',    needs: 'none',                desc: 'Project primer (DIRGHA.md) loader' },
  { name: 'skills',     file: 'skills_test.mjs',    needs: 'none',                desc: 'Skills loader / matcher / runtime' },
  { name: 'transport',  file: 'transport_test.mjs', needs: 'none',                desc: 'OpenAI-compat provider factory + presets' },
  { name: 'mode',       file: 'mode_enforcement_test.mjs', needs: 'none',         desc: 'Plan/verify mode blocks write tools' },
  { name: 'themes',     file: 'themes_test.mjs',    needs: 'none',                desc: 'User-defined theme loader' },
  { name: 'ledger',     file: 'ledger_test.mjs',    needs: 'none',                desc: 'Append-only ledger + digest' },
  { name: 'mcp',        file: 'mcp_test.mjs',       needs: 'none',                desc: 'MCP stdio + HTTP transport, real client round-trip' },
  { name: 'registry',   file: 'registry_test.mjs',  needs: 'none',                desc: 'Model registry single source of truth' },
  { name: 'compaction', file: 'compaction_test.mjs',needs: 'none',                desc: 'Auto-trigger summarisation + compaction hooks' },
  { name: 'cost',       file: 'cost_test.mjs',      needs: 'none',                desc: 'Cost tracker: record / sessionTotal / dailyTotal / budget' },
  { name: 'audit',      file: 'audit_test.mjs',     needs: 'none',                desc: 'Audit log: append / round-trip / search / fail-safe' },
  { name: 'session',    file: 'session_test.mjs',   needs: 'none',                desc: 'Session JSONL store: create / append / messages / branch' },
  { name: 'keys',       file: 'keys_test.mjs',      needs: 'none',                desc: 'BYOK keystore: parse / hydrate / shell-override / idempotent' },
  { name: 'kernel-hooks', file: 'kernel_hooks_test.mjs', needs: 'none',           desc: 'AgentHooks lifecycle: beforeTurn / beforeToolCall (veto) / afterToolCall (rewrite) / afterTurn / abort' },
  { name: 'cancel-off', file: 'cancel_offline_test.mjs', needs: 'none',           desc: 'AbortController: mid-stream abort, pre-abort, tool signal' },
  { name: 'tool-reg',   file: 'tool_registry_test.mjs', needs: 'none',            desc: 'Tool registry: register / sanitize / MCP-bridged tools' },
  { name: 'errors',     file: 'error_classifier_test.mjs', needs: 'none',         desc: 'Error classifier: HTTP status → reason / retryable / fallback / backoff' },
  { name: 'aliases',    file: 'aliases_test.mjs',   needs: 'none',                desc: 'Model aliases: short → canonical, case + whitespace + passthrough' },
  { name: 'undo',       file: 'undo_test.mjs',      needs: 'none',                desc: 'dirgha undo: rollback N turns, .bak snapshot, --list / --json' },
  { name: 'git-state',  file: 'git_state_test.mjs', needs: 'none',                desc: 'Workspace git_state probe: branch + dirty + recent + staged diff' },
  { name: 'skills-pkg', file: 'skills_install_test.mjs', needs: 'none',           desc: 'dirgha skills install/uninstall: clone remote, derive name, dedup, missing-SKILL.md' },
  { name: 'rate-limit', file: 'rate_limit_test.mjs', needs: 'none',               desc: 'Provider rate-limit middleware: token bucket, burst, refill, fail-fast' },
  { name: 'ledger-rank',file: 'ledger_search_test.mjs', needs: 'none',            desc: 'Ledger TF-IDF cosine ranking: high-IDF lift, fallback, topK, stability' },
  { name: 'mcp-oauth',  file: 'mcp_oauth_test.mjs', needs: 'none',                desc: 'MCP HTTP transport: bearerProvider rotation, sync/async, undefined drops header' },
  { name: 'tokrate',    file: 'tokrate_test.mjs',   needs: 'none',                desc: 'StatusBar tok/s readout: warmup, idle, zero, arithmetic' },
  { name: 'task-tool',  file: 'task_tool_test.mjs', needs: 'none',                desc: 'Subagent task tool: registry / dispatch / allowlist / sessionId scoping' },
  { name: 'login-byok', file: 'login_byok_test.mjs', needs: 'none',               desc: 'dirgha login --provider=<name> --key=… stores key, mode 0600, hydrate visible' },
  { name: 'nim-stream', file: 'nim_stream_test.mjs', needs: 'none',               desc: 'NVIDIA NIM SSE: delta.reasoning + reasoning_content + content paths, includeThinking=false' },
  { name: 'keypool',    file: 'keypool_test.mjs',   needs: 'none',                desc: 'BYOK multi-key pool: priority + cooldown + LRU + lock + hydrate' },
  { name: 'soul',       file: 'soul_test.mjs',      needs: 'none',                desc: 'Soul loader: default body, user override, 4 KB cap, prompt order' },
  { name: 'update',     file: 'update_test.mjs',    needs: 'none',                desc: 'dirgha update: compareSemver / checkLatestVersion (injected fetch) / listInstalledPacks' },
  { name: 'models-rfs', file: 'models_refresh_test.mjs', needs: 'none',           desc: 'dirgha models refresh: parallel fetch / cache / TTL / per-provider error isolation' },
  { name: 'extensions', file: 'extensions_test.mjs', needs: 'none',               desc: 'Extensions API: register tool/slash/sub + on(event) + emit + loadExtensions' },
  { name: 'kb',         file: 'kb_test.mjs',        needs: 'NETWORK',             desc: 'dirgha kb wrapper: headless init / ingest skip / unknown sub' },
  { name: 'skill-scan', file: 'skill_scanner_test.mjs', needs: 'none',            desc: 'Skill scanner: prompt-injection / supply-chain heuristics, verdict gate' },
  { name: 'hooks',      file: 'hooks_test.mjs',     needs: 'OPENROUTER_API_KEY',  desc: 'Kernel hooks lifecycle', heavy: true },
  { name: 'cancel',     file: 'cancel_test.mjs',    needs: 'OPENROUTER_API_KEY',  desc: 'AbortController mid-stream', heavy: true },
  { name: 'matrix',     file: 'provider_matrix.mjs',needs: 'any-provider-key',    desc: 'Chat + tool across catalogue', heavy: true },
];

const ANSI_GREEN = '\x1b[32m';
const ANSI_RED = '\x1b[31m';
const ANSI_DIM = '\x1b[2m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RESET = '\x1b[0m';

function envSatisfies(needs) {
  if (needs === 'none') return true;
  if (needs === 'any-provider-key') {
    return Boolean(process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
  }
  if (needs === 'NETWORK') {
    // Network-bound suites (e.g. kb wrapper hits an openkb tool that
    // tries to fetch). Skip in --offline runs and on minimal CI runners.
    return !offline;
  }
  return Boolean(process.env[needs]);
}

function runOne(file, suiteArgs) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn('node', [join(here, file), ...suiteArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString('utf8'); });
    child.stderr.on('data', d => { err += d.toString('utf8'); });
    child.on('close', code => {
      resolve({ exit: code ?? 1, durationMs: Date.now() - t0, stdout: out, stderr: err });
    });
    child.on('error', e => {
      resolve({ exit: 1, durationMs: Date.now() - t0, stdout: '', stderr: String(e) });
    });
  });
}

const results = [];
const start = Date.now();
console.log(`${ANSI_BOLD}dirgha-cli — full test sweep${ANSI_RESET}\n`);

for (const suite of SUITES) {
  if (only && suite.name !== only) continue;
  if (offline && suite.heavy) {
    console.log(`${ANSI_DIM}⊘ ${suite.name}${ANSI_RESET}  ${suite.desc}  ${ANSI_DIM}(skipped: --offline)${ANSI_RESET}`);
    results.push({ ...suite, status: 'skip', reason: '--offline' });
    continue;
  }
  if (quick && suite.name === 'matrix') {
    console.log(`${ANSI_DIM}⊘ ${suite.name}${ANSI_RESET}  ${suite.desc}  ${ANSI_DIM}(skipped: --quick)${ANSI_RESET}`);
    results.push({ ...suite, status: 'skip', reason: '--quick' });
    continue;
  }
  if (!envSatisfies(suite.needs)) {
    console.log(`${ANSI_DIM}⊘ ${suite.name}${ANSI_RESET}  ${suite.desc}  ${ANSI_DIM}(skipped: ${suite.needs} unset)${ANSI_RESET}`);
    results.push({ ...suite, status: 'skip', reason: `${suite.needs} unset` });
    continue;
  }

  process.stdout.write(`${ANSI_BOLD}▸ ${suite.name}${ANSI_RESET}  ${suite.desc}  …\n`);
  // Pass quick-friendly args to provider_matrix so it doesn't take 10 min
  const suiteArgs = suite.name === 'matrix' ? ['--max=3', '--timeout-ms=30000'] : [];
  const r = await runOne(suite.file, suiteArgs);
  const ok = r.exit === 0;
  const durationS = (r.durationMs / 1000).toFixed(1);
  const colour = ok ? ANSI_GREEN : ANSI_RED;
  const mark = ok ? '✓' : '✗';
  console.log(`${colour}${mark} ${suite.name}${ANSI_RESET}  ${suite.desc}  (${durationS}s)`);
  results.push({ ...suite, status: ok ? 'pass' : 'fail', durationMs: r.durationMs, exit: r.exit });
  if (!ok) {
    // Surface the suite's own summary line(s) so failures explain themselves.
    const trail = (r.stdout + r.stderr).trim().split('\n').slice(-12).join('\n');
    console.log(`${ANSI_DIM}--- last 12 lines ---${ANSI_RESET}\n${trail}\n${ANSI_DIM}---${ANSI_RESET}`);
    if (bail) break;
  }
}

const total = (Date.now() - start) / 1000;
const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const skipped = results.filter(r => r.status === 'skip').length;

console.log();
console.log(`${ANSI_BOLD}summary${ANSI_RESET}  ${passed} passed · ${failed} failed · ${skipped} skipped · ${total.toFixed(1)}s`);

process.exit(failed === 0 ? 0 : 1);
