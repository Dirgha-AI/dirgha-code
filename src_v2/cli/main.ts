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
import { renderStreamingEvents } from '../tui/renderer.js';
import { createSessionStore } from '../context/session.js';
import { runSubmitPaper } from './submit-paper.js';
import { runLogin, runLogout, runSetup, findSubcommand } from './subcommands/index.js';

async function main(): Promise<void> {
  const { flags, positionals } = parseFlags(argv.slice(2));
  if (flags.help || flags.h) { printHelp(); exit(0); }

  // Subcommand dispatch (positional 0 as verb).
  if (positionals[0] === 'submit-paper') {
    const doi = positionals[1];
    if (!doi) { stdout.write('usage: dirgha submit-paper <doi> [--open-pr]\n'); exit(1); }
    const code = await runSubmitPaper({ doi, openPr: flags['open-pr'] === true });
    exit(code);
  }
  if (positionals[0] === 'login') exit(await runLogin(positionals.slice(1)));
  if (positionals[0] === 'logout') exit(await runLogout(positionals.slice(1)));
  if (positionals[0] === 'setup') exit(await runSetup(positionals.slice(1)));

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
  const model = (typeof flags.model === 'string' ? flags.model : (typeof flags.m === 'string' ? flags.m : config.model));
  const json = flags.json === true;
  const print = flags.print === true;
  const system = typeof flags.system === 'string' ? flags.system : (typeof flags.s === 'string' ? flags.s : undefined);
  const maxTurns = typeof flags['max-turns'] === 'string' ? Number.parseInt(flags['max-turns'], 10) : config.maxTurns;

  const providers = new ProviderRegistry();
  const registry = createToolRegistry(builtInTools);
  const sessions = createSessionStore();

  let prompt = positionals.join(' ').trim();
  if (!prompt && !stdin.isTTY) prompt = (await readAllStdin()).trim();

  if (!prompt) {
    if (print || json) { printHelp(); exit(1); }
    // Ink TUI is the default interactive renderer. Fall back to the
    // readline REPL when DIRGHA_NO_INK=1 (diagnostic / CI escape hatch).
    const useInk = process.env['DIRGHA_NO_INK'] !== '1' && stdin.isTTY;
    if (useInk) {
      await runInkTUI({ registry, providers, sessions, config, cwd: cwd(), systemPrompt: system });
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

  const executor = createToolExecutor({ registry, cwd: cwd(), sessionId });
  const sanitized = registry.sanitize({ descriptionLimit: 200 });
  const messages: Message[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const result = await runAgentLoop({
    sessionId,
    model,
    messages,
    tools: sanitized.definitions,
    maxTurns,
    provider: providers.forModel(model),
    toolExecutor: executor,
    events,
  });
  if (!json) stdout.write('\n');
  if (result.stopReason === 'error') exit(2);
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
  compact [sessionId]                 Force-compact a session on disk
  export-session <id> [path|-]        Dump session JSON
  import-session <path>               Load session JSON into the store
  login / logout / setup              Auth + first-run wizard
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
