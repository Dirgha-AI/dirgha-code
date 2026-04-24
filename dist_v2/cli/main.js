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
import { ProviderRegistry } from '../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../tools/index.js';
import { loadConfig } from './config.js';
import { parseFlags } from './flags.js';
import { runInteractive } from './interactive.js';
import { runInkTUI } from '../tui/ink/index.js';
import { renderStreamingEvents } from '../tui/renderer.js';
import { createSessionStore } from '../context/session.js';
import { runSubmitPaper } from './submit-paper.js';
async function main() {
    const { flags, positionals } = parseFlags(argv.slice(2));
    if (flags.help || flags.h) {
        printHelp();
        exit(0);
    }
    // Subcommand dispatch (positional 0 as verb).
    if (positionals[0] === 'submit-paper') {
        const doi = positionals[1];
        if (!doi) {
            stdout.write('usage: dirgha submit-paper <doi> [--open-pr]\n');
            exit(1);
        }
        const code = await runSubmitPaper({ doi, openPr: flags['open-pr'] === true });
        exit(code);
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
    if (!prompt && !stdin.isTTY)
        prompt = (await readAllStdin()).trim();
    if (!prompt) {
        if (print || json) {
            printHelp();
            exit(1);
        }
        // Ink TUI is the default interactive renderer. Fall back to the
        // readline REPL when DIRGHA_NO_INK=1 (diagnostic / CI escape hatch).
        const useInk = process.env['DIRGHA_NO_INK'] !== '1' && stdin.isTTY;
        if (useInk) {
            await runInkTUI({ registry, providers, sessions, config, cwd: cwd(), systemPrompt: system });
        }
        else {
            await runInteractive({ registry, providers, sessions, config, cwd: cwd(), systemPrompt: system });
        }
        return;
    }
    const sessionId = randomUUID();
    const events = createEventStream();
    if (json) {
        events.subscribe(ev => { stdout.write(`${JSON.stringify(ev)}\n`); });
    }
    else {
        events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));
    }
    const executor = createToolExecutor({ registry, cwd: cwd(), sessionId });
    const sanitized = registry.sanitize({ descriptionLimit: 200 });
    const messages = [];
    if (system)
        messages.push({ role: 'system', content: system });
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
    if (!json)
        stdout.write('\n');
    if (result.stopReason === 'error')
        exit(2);
}
function readAllStdin() {
    return new Promise(resolve => {
        const chunks = [];
        stdin.setEncoding('utf8');
        stdin.on('data', c => chunks.push(typeof c === 'string' ? c : c.toString('utf8')));
        stdin.on('end', () => resolve(chunks.join('')));
    });
}
function printHelp() {
    stdout.write(`dirgha — coding agent CLI

Usage:
  dirgha                              Interactive REPL
  dirgha "prompt"                     One-shot non-interactive
  echo prompt | dirgha --print        Stdin prompt → stdout answer
  dirgha --json "prompt"              NDJSON event stream
  dirgha submit-paper <doi>           Fetch Crossref metadata, emit JSON
                                      (optionally open PR to dirgha-org-site)

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
main().catch((err) => {
    stdout.write(`\nFatal: ${err instanceof Error ? err.message : String(err)}\n`);
    exit(2);
});
//# sourceMappingURL=main.js.map