#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Default behaviour: when a prompt is provided on the command line, run
 * a single turn non-interactively and exit. When no prompt is provided
 * and stdin is a TTY, enter the interactive REPL. When stdin is piped,
 * read the prompt from stdin and run non-interactively.
 */

import { argv, cwd, exit, stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { createEventStream } from '../kernel/event-stream.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import type { Message } from '../kernel/types.js';
import { ProviderRegistry } from '../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../tools/index.js';
import { loadConfig } from './config.js';
import { parseFlags } from './flags.js';
import { runInteractive } from './interactive.js';
import { runInkTUI } from '../tui/ink/index.js';
import { builtinSlashCommands } from './slash/index.js';
import { renderStreamingEvents } from '../tui/renderer.js';
import { createSessionStore } from '../context/session.js';
import { runSubmitPaper } from './submit-paper.js';
import { runLogin, runLogout, runSetup, findSubcommand } from './subcommands/index.js';
import { appendAudit } from '../audit/writer.js';
import { buildAgentHooksFromConfig } from '../hooks/config-bridge.js';
import { hydrateEnvFromKeyStore } from '../auth/keystore.js';
import { hydrateEnvFromPool } from '../auth/keypool.js';
import { createExtensionAPI, loadExtensions } from '../extensions/api.js';
import { createErrorClassifier } from '../intelligence/error-classifier.js';
import { createCompactionTransform } from '../context/compaction.js';
import { contextWindowFor, findPrice, findFailover, resolveModelAlias } from '../intelligence/prices.js';
import { routeModel } from '../providers/dispatch.js';
import { loadProjectPrimer, composeSystemPrompt } from '../context/primer.js';
import { probeGitState, renderGitState } from '../context/git-state.js';
import { loadSoul } from '../context/soul.js';
import { modePreamble, resolveMode, isAutoApprove, type Mode } from '../context/mode.js';
import { enforceMode, composeHooks } from '../context/mode-enforcement.js';
import { loadSkills } from '../skills/loader.js';
import { matchSkills } from '../skills/matcher.js';
import { injectSkills } from '../skills/runtime.js';
import { createRequire } from 'node:module';

// `--version` / `-V` prints the package version and exits, matching every
// other CLI on the planet. Without this, the flag-parser strips `--version`
// as a generic boolean and falls through to the interactive REPL.
const PKG_VERSION: string = (() => {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-dev';
  } catch { return '0.0.0-dev'; }
})();

async function main(): Promise<void> {
  const { flags, positionals } = parseFlags(argv.slice(2));
  // Top-level help/version only fire when there's no verb. With a verb
  // present (e.g. `dirgha fleet --help`), let the subcommand handle its
  // own help so users get scoped docs.
  if ((flags.help || flags.h) && positionals.length === 0) { printHelp(); exit(0); }
  if (flags.version || flags.V) { stdout.write(`dirgha ${PKG_VERSION}\n`); exit(0); }

  // BYOK hydration: pool first (highest-priority non-exhausted entry
  // wins), then the legacy single-slot keystore for backwards compat.
  // Real env vars beat both, so a shell-exported override still wins.
  await hydrateEnvFromPool();
  await hydrateEnvFromKeyStore();

  // Load user extensions from ~/.dirgha/extensions/<name>/index.mjs.
  // Extensions register tools, slashes, subcommands, and event handlers.
  // Loading failures are non-fatal — the failing extension is named on
  // stderr and the rest of the CLI continues.
  const { api: extAPI, registry: extRegistry } = createExtensionAPI();
  const { join: pathJoin } = await import('node:path');
  const { homedir: hd } = await import('node:os');
  const extResult = await loadExtensions({ rootDir: pathJoin(hd(), '.dirgha', 'extensions'), api: extAPI });
  for (const f of extResult.failed) {
    process.stderr.write(`[extensions] ${f.name} failed to load: ${f.error.message}\n`);
  }
  void extRegistry; // surface for downstream wiring (slashes / tools / events)

  // Subcommand dispatch (positional 0 as verb).
  if (positionals[0] === 'submit-paper') {
    const doi = positionals[1];
    if (!doi) { stdout.write('usage: dirgha submit-paper <doi> [--open-pr]\n'); exit(1); }
    const code = await runSubmitPaper({ doi, openPr: flags['open-pr'] === true });
    exit(code);
  }
  // Pass the RAW argv tail (includes flags like `--provider=...`) so
  // sub-flags survive the top-level parser, the same pattern as fleet.
  if (positionals[0] === 'login') {
    const rawArgs = argv.slice(2);
    const verbIdx = rawArgs.indexOf('login');
    const tail = verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    exit(await runLogin(tail));
  }
  if (positionals[0] === 'logout') {
    const rawArgs = argv.slice(2);
    const verbIdx = rawArgs.indexOf('logout');
    const tail = verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    exit(await runLogout(tail));
  }
  if (positionals[0] === 'setup') exit(await runSetup(positionals.slice(1)));
  if (positionals[0] === 'fleet') {
    // `dirgha fleet <launch|list|merge|discard|triple|cleanup>` —
    // parallel-agent orchestration in git worktrees. We pass the
    // RAW argv tail (positionals + flags) so the fleet dispatcher
    // can read its own subcommand-specific flags like --single,
    // --branch=<x>, --auto-merge, --strategy that the top-level
    // parser doesn't know about.
    const { fleetCommand } = await import('../fleet/cli-command.js');
    const config = await loadConfig(cwd());
    const rawArgs = argv.slice(2);
    const verbIdx = rawArgs.indexOf('fleet');
    const tail = verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    const code = await fleetCommand(tail, {
      cwd: cwd(),
      model: resolveModelAlias(typeof flags.model === 'string' ? flags.model : (typeof flags.m === 'string' ? flags.m : config.model)),
      json: flags.json === true,
      verbose: flags.verbose === true,
      maxTurns: typeof flags['max-turns'] === 'string' ? Number.parseInt(flags['max-turns'], 10) : config.maxTurns,
      concurrency: typeof flags.concurrency === 'string' ? Number.parseInt(flags.concurrency, 10) : undefined,
    });
    exit(code);
  }

  // Generic subcommand dispatch. Covers: doctor, audit, stats, status,
  // init, keys, models, chat, ask, compact, export-session,
  // import-session (plus anything the auth agent adds to the barrel).
  //
  // We pass the raw argv tail (unparsed) so each subcommand can re-run
  // parseFlags with its own conventions. The tail starts after the
  // first occurrence of the verb in argv.
  {
    const verb = positionals[0];
    const cmd = verb ? findSubcommand(verb) : undefined;
    if (cmd) {
      const rawArgs = argv.slice(2);
      const verbIdx = rawArgs.indexOf(verb);
      const tail = verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
      const code = await cmd.run(tail, { cwd: cwd() });
      exit(code);
    }
  }

  const config = await loadConfig(cwd());
  const rawModel = (typeof flags.model === 'string' ? flags.model : (typeof flags.m === 'string' ? flags.m : config.model));
  const model = resolveModelAlias(rawModel);
  const json = flags.json === true;
  const print = flags.print === true;
  const system = typeof flags.system === 'string' ? flags.system : (typeof flags.s === 'string' ? flags.s : undefined);
  const maxTurns = typeof flags['max-turns'] === 'string' ? Number.parseInt(flags['max-turns'], 10) : config.maxTurns;

  const providers = new ProviderRegistry();
  const sessions = createSessionStore();

  // Load MCP servers from config and bridge their tools into the
  // registry. Failures spawning one server don't break the others;
  // they just surface as warnings on stderr. `mcp.shutdown()` runs at
  // process exit to terminate child processes cleanly.
  const allTools = [...builtInTools];
  let mcpShutdown: () => Promise<void> = async () => {};
  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    const { loadMcpServers } = await import('../mcp/loader.js');
    const mcp = await loadMcpServers(config.mcpServers, {
      onWarn: msg => { process.stderr.write(`warning: ${msg}\n`); },
    });
    allTools.push(...mcp.tools);
    mcpShutdown = mcp.shutdown;
  }
  const registry = createToolRegistry(allTools);
  process.once('exit', () => { void mcpShutdown(); });
  process.once('SIGINT', () => { void mcpShutdown().then(() => process.exit(130)); });

  // Subagent dispatch: register `task` so the model can spawn a fresh
  // agent for a sub-goal. Built lazily so the
  // delegator can capture the now-finalised registry + provider.
  const { SubagentDelegator } = await import('../subagents/delegator.js');
  const { createTaskTool } = await import('../tools/task.js');
  // Provider is constructed below; capture via closure so the tool sees
  // the same one. Re-pulled fresh inside execute() so failover swaps work.
  const taskDelegatorRef: { current: InstanceType<typeof SubagentDelegator> | null } = { current: null };
  registry.register(createTaskTool({
    delegate: async (req) => {
      if (!taskDelegatorRef.current) throw new Error('subagent delegator not yet initialised');
      return taskDelegatorRef.current.delegate(req);
    },
  } as InstanceType<typeof SubagentDelegator>));

  let prompt = positionals.join(' ').trim();
  if (!prompt && !stdin.isTTY) prompt = (await readAllStdin()).trim();

  if (!prompt) {
    if (print || json) { printHelp(); exit(1); }
    // First-run wizard: if the user has no BYOK keys saved AND no
    // hosted token, auto-launch the three-step setup flow. The wizard
    // itself prints CI-safe help when stdin is non-TTY.
    if (stdin.isTTY && await isFirstRun()) {
      const { runWizard } = await import('./flows/wizard.js');
      const code = await runWizard([]);
      // If they completed setup, fall through into the REPL so they
      // can immediately use what they just configured. Otherwise exit.
      if (code !== 0) exit(code);
    }
    // Ink TUI is the default interactive renderer. Fall back to the
    // readline REPL when DIRGHA_NO_INK=1 (diagnostic / CI escape hatch).
    const useInk = process.env['DIRGHA_NO_INK'] !== '1' && stdin.isTTY;
    if (useInk) {
      const slashCommands = builtinSlashCommands.map(c => ({
        name: c.name,
        description: c.description,
        ...(c.aliases !== undefined ? { aliases: c.aliases } : {}),
      }));
      await runInkTUI({ registry, providers, sessions, config, cwd: cwd(), systemPrompt: system, slashCommands });
    } else {
      await runInteractive({ registry, providers, sessions, config, cwd: cwd(), systemPrompt: system });
    }
    return;
  }

  const sessionId = randomUUID();
  const events = createEventStream();
  if (json) {
    events.subscribe(ev => { stdout.write(`${JSON.stringify(ev)}\n`); });
  } else {
    events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));
  }

  // Persist the session: open the JSONL file up front so subsequent
  // `dirgha export-session` / `import-session` / `resume` work, and
  // so `dirgha stats` sees real message + token counts. Mirrors what
  // `runInteractive` already does for the readline path.
  const session = await sessions.create(sessionId);
  const sessionTs = (): string => new Date().toISOString();
  // Compute USD cost from the price catalogue so persisted usage entries
  // and `dirgha stats` aren't always $0.00. Provider id is resolved from
  // the model id via the dispatch router (same routing the agent loop
  // uses, so the price lookup matches the actual provider).
  const providerId = routeModel(model);
  const price = findPrice(providerId, model);
  const computeCost = (input: number, output: number, cached: number): number => price
    ? (input / 1_000_000) * price.inputPerM + (output / 1_000_000) * price.outputPerM + (cached / 1_000_000) * (price.cachedInputPerM ?? 0)
    : 0;
  events.subscribe(async ev => {
    try {
      if (ev.type === 'usage') {
        const cached = ev.cachedTokens ?? 0;
        await session.append({ type: 'usage', ts: sessionTs(), usage: {
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          cachedTokens: cached,
          costUsd: computeCost(ev.inputTokens, ev.outputTokens, cached),
        } });
      }
    } catch { /* never let persistence I/O break the run */ }
  });
  // Audit writer: produce entries the `dirgha audit` reader can show.
  // Tool executions, errors, and end-of-turn are the high-signal ones.
  events.subscribe(ev => {
    if (ev.type === 'tool_exec_end') {
      void appendAudit({
        kind: 'tool',
        actor: sessionId,
        summary: `${ev.id} ${ev.isError ? 'error' : 'done'} ${ev.durationMs}ms`,
        toolId: ev.id,
        isError: ev.isError,
        durationMs: ev.durationMs,
      });
    } else if (ev.type === 'agent_end') {
      void appendAudit({
        kind: 'turn-end',
        actor: sessionId,
        summary: `model=${model} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}`,
        model,
        stopReason: ev.stopReason,
        usage: ev.usage,
      });
    } else if (ev.type === 'error') {
      void appendAudit({ kind: 'error', actor: sessionId, summary: ev.message });
    }
  });

  const executor = createToolExecutor({ registry, cwd: cwd(), sessionId });
  const sanitized = registry.sanitize({ descriptionLimit: 200 });

  // Boot context: mode preamble + project primer (DIRGHA.md or
  // CLAUDE.md, capped at 8 KB) + caller's --system text. Without
  // this, the agent has zero project awareness — it's the parity
  // matrix's #1 gap to close.
  let mode = await resolveMode();
  // CLI-level overrides for one-off mode flips. `--yolo` is the most
  // surface-level form of "skip every approval", more discoverable
  // than `DIRGHA_MODE=yolo`.
  if (flags.yolo === true) mode = 'yolo' as Mode;
  if (typeof flags.mode === 'string' && (['plan', 'act', 'yolo', 'verify', 'ask'] as const).includes(flags.mode as Mode)) {
    mode = flags.mode as Mode;
  }
  const autoApprove = isAutoApprove(mode);
  // Audit: record session start so `dirgha audit search <model>` /
  // `audit list` can surface every dirgha invocation, not just turns.
  // Lives after mode-resolve so we can include it in the entry.
  void appendAudit({
    kind: 'session-start',
    actor: sessionId,
    summary: `model=${model} mode=${mode} cwd=${cwd()}`,
    model,
    mode,
    cwd: cwd(),
  });
  const primer = loadProjectPrimer(cwd());
  const soul = loadSoul();
  // Don't inject git_state in one-shot mode — small / fast models
  // can fixate on the workspace state and answer about it instead of
  // the user's prompt. Interactive sessions still inject it because
  // the conversation context anchors the model on the actual goal.
  const composedSystem = composeSystemPrompt({
    soul: soul.text,
    modePreamble: modePreamble(mode),
    primer: primer.primer,
    userSystem: system,
  });

  const messages: Message[] = [];
  messages.push({ role: 'system', content: composedSystem });
  messages.push({ role: 'user', content: prompt });

  // Append the user prompt before the turn so a crash mid-stream still
  // leaves a recoverable transcript prefix.
  await session.append({ type: 'message', ts: sessionTs(), message: { role: 'user', content: prompt } });
  await session.append({ type: 'message', ts: sessionTs(), message: { role: 'system', content: composedSystem } });

  // Skills: load all available; inject the ones whose triggers match
  // this turn's user prompt. Project-local skills override user skills
  // when names collide (loadSkills handles that). Skill bodies are
  // injected as a synthetic user message before the live prompt.
  const allSkills = await loadSkills({ cwd: cwd() });
  const matched = matchSkills(allSkills, { platform: 'cli', userMessage: prompt });

  // Provider construction can fail eagerly (e.g. ANTHROPIC_API_KEY
  // unset). When it does AND the user has a known failover model in
  // the registry, swap to that before we even reach the agent loop.
  // Same audit `failover` entry as runtime-error failover.
  let activeModel = model;
  let provider;
  try {
    provider = providers.forModel(model);
  } catch (err) {
    const fallback = findFailover(model);
    if (!fallback) throw err;
    process.stderr.write(`\n[failover] ${model} → ${fallback} (${err instanceof Error ? err.message : String(err)})\n`);
    void appendAudit({ kind: 'failover', actor: sessionId, summary: `${model} → ${fallback}`, from: model, to: fallback, reason: err instanceof Error ? err.message : String(err) });
    activeModel = fallback;
    provider = providers.forModel(fallback);
  }
  // Now that provider + activeModel are settled, instantiate the
  // delegator that the `task` tool delegate-shim references.
  taskDelegatorRef.current = new SubagentDelegator({
    registry,
    provider,
    defaultModel: activeModel,
    cwd: cwd(),
    parentSessionId: sessionId,
  });
  // Context-aware compaction: at 75% of the model's context window we
  // summarise older history via the same provider and replace the
  // prefix with a synthetic user message. Keeps long sessions runnable
  // without 400-context-overflow errors.
  const baseCompactionTransform = createCompactionTransform({
    contextWindow: contextWindowFor(activeModel),
    summarizer: provider,
    summaryModel: activeModel,
    session,
    history: messages,
    onCompact: (r): void => {
      const before = r.tokensBefore.toLocaleString();
      const after = r.tokensAfter.toLocaleString();
      const pct = Math.round((1 - r.tokensAfter / r.tokensBefore) * 100);
      process.stderr.write(`\n[compacted] ${before} → ${after} tokens (-${pct}%)\n`);
      void appendAudit({ kind: 'compaction', actor: sessionId, summary: `${before} → ${after} (-${pct}%)`, tokensBefore: r.tokensBefore, tokensAfter: r.tokensAfter });
    },
  });
  // Compose: compact first, then inject skills before the live user
  // message. Skill content is per-turn — does not survive compaction.
  const compactionTransform = matched.length > 0
    ? async (msgs: Message[]): Promise<Message[]> => injectSkills(await baseCompactionTransform(msgs), matched)
    : baseCompactionTransform;

  // Hooks: compose mode enforcement (plan/verify block writes) with
  // user-config hooks. Order matters — mode enforcement runs first so
  // a "shell command blocked by policy" stays clear in the audit log.
  const userHooks = buildAgentHooksFromConfig(config);
  const composedHooks = composeHooks(enforceMode(mode), userHooks);
  const errorClassifier = createErrorClassifier();
  let result = await runAgentLoop({
    sessionId,
    model: activeModel,
    messages,
    tools: sanitized.definitions,
    maxTurns,
    provider,
    toolExecutor: executor,
    events,
    contextTransform: compactionTransform,
    errorClassifier,
    autoApprove,
    ...(composedHooks !== undefined ? { hooks: composedHooks } : {}),
  });
  // Runtime failover: if the agent loop errored (5xx, timeout, etc.)
  // and we have a registered fallback for the active model, swap and
  // continue from the LAST PERSISTED HISTORY (not the original prompt)
  // so multi-turn work doesn't lose progress. Skipped when we already
  // failed over at construction time so we don't double-hop.
  if (result.stopReason === 'error' && activeModel === model) {
    const fallback = findFailover(activeModel);
    if (fallback) {
      try {
        const fallbackProvider = providers.forModel(fallback);
        process.stderr.write(`\n[failover] ${activeModel} → ${fallback} (mid-session at turn ${result.turnCount})\n`);
        void appendAudit({ kind: 'failover', actor: sessionId, summary: `${activeModel} → ${fallback} (turn ${result.turnCount})`, from: activeModel, to: fallback, turn: result.turnCount });
        result = await runAgentLoop({
          sessionId,
          model: fallback,
          // Resume from whatever messages survived — partial work isn't lost.
          messages: result.messages,
          tools: sanitized.definitions,
          maxTurns: Math.max(1, maxTurns - result.turnCount),
          provider: fallbackProvider,
          toolExecutor: executor,
          events,
          contextTransform: compactionTransform,
          errorClassifier,
          autoApprove,
          ...(composedHooks !== undefined ? { hooks: composedHooks } : {}),
        });
      } catch { /* swallow — original error already reported */ }
    }
  }
  // Persist every message produced by the turn (assistant turns + tool
  // results). Skip the user + system messages we already appended above.
  const initialCount = 2;
  for (const msg of result.messages.slice(initialCount)) {
    try { await session.append({ type: 'message', ts: sessionTs(), message: msg }); } catch { /* swallow */ }
  }
  if (!json) stdout.write('\n');
  if (result.stopReason === 'error') exit(2);
}

async function isFirstRun(): Promise<boolean> {
  const { stat } = await import('node:fs/promises');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const home = homedir();
  const candidates = [
    join(home, '.dirgha', 'keys.json'),
    join(home, '.dirgha', 'credentials.json'),
    join(home, '.dirgha', 'config.json'),
  ];
  for (const p of candidates) {
    const exists = await stat(p).then(() => true).catch(() => false);
    if (exists) return false;
  }
  return true;
}

function readAllStdin(): Promise<string> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    stdin.setEncoding('utf8');
    stdin.on('data', c => chunks.push(typeof c === 'string' ? c : (c as Buffer).toString('utf8')));
    stdin.on('end', () => resolve(chunks.join('')));
  });
}

function printHelp(): void {
  stdout.write(`dirgha — coding agent CLI

Usage:
  dirgha                              Interactive REPL
  dirgha "prompt"                     One-shot non-interactive (equivalent to dirgha ask)
  echo prompt | dirgha --print        Stdin prompt → stdout answer
  dirgha --json "prompt"              NDJSON event stream

Subcommands:
  ask "<prompt>"                      Headless agent (tools, --max-turns 30 default)
  chat "<prompt>"                     Pure LLM call, no tools
  doctor [--json]                     Environment diagnostics
  status [--json]                     Account / model / providers / sessions
  stats [today|week|month|all]        Usage aggregates
  audit [list|tail|search <q>]        Local audit log
  init [path] [--force]               Scaffold DIRGHA.md
  keys <list|set|get|clear> ...       BYOK key store (~/.dirgha/keys.json)
  models <list|default|info> ...      Model catalogue + default
  memory <list|show|add|remove> ...   Long-term memory in ~/.dirgha/memory
  fleet <launch|list|merge|...> ...   Parallel agents in git worktrees
  verify "<goal>" --accept "<cmd>"    Run goal then gate on shell exit 0
  compact [sessionId]                 Force-compact a session on disk
  export-session <id> [path|-]        Dump session JSON
  import-session <path>               Load session JSON into the store
  login / logout / setup              Auth + first-run wizard
  update [--check] [--yes]            Check for + install latest @dirgha/code
  telemetry <status|enable|...>      Anonymous usage opt-in (default: OFF)
  submit-paper <doi>                  Fetch Crossref metadata, emit JSON

Options:
  -m, --model <id>                    Model id (default from config)
  -t, --temperature <n>               Sampling temperature
  -s, --system <text>                 System prompt
      --max-turns <n>                 Max agent turns
      --print                         Non-interactive; text output
      --json                          NDJSON event output
  -h, --help                          This help

Environment:
  DIRGHA_MODEL, DIRGHA_MAX_TURNS, DIRGHA_SHOW_THINKING
  NVIDIA_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY,
  GEMINI_API_KEY / GOOGLE_API_KEY
`);
}

main().catch((err: unknown) => {
  stdout.write(`\nFatal: ${err instanceof Error ? err.message : String(err)}\n`);
  exit(2);
});
