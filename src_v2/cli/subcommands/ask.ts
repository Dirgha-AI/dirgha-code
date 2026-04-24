/**
 * `dirgha ask "prompt"` — headless one-shot with tools.
 *
 * Semantically equivalent to passing a bare positional prompt to
 * `dirgha` on the command line (handled in main.ts), but spelled
 * explicitly so scripts can be self-documenting and unambiguous. We
 * default `--max-turns` to 30 (v1 parity) and forward everything else
 * through the main agent path.
 *
 * Implementation mirrors main.ts's non-interactive branch — we don't
 * delegate to it because that path lives inside a top-level async
 * `main()` with early exits, which makes it awkward to reuse as a
 * function. Keeping the one-shot pipeline here keeps the subcommand
 * composable and testable.
 */

import { stdout, stderr } from 'node:process';
import { randomUUID } from 'node:crypto';
import { parseFlags } from '../flags.js';
import { loadConfig } from '../config.js';
import { ProviderRegistry } from '../../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../../tools/index.js';
import { createEventStream } from '../../kernel/event-stream.js';
import { runAgentLoop } from '../../kernel/agent-loop.js';
import { renderStreamingEvents } from '../../tui/renderer.js';
import type { Message } from '../../kernel/types.js';
import type { Subcommand } from './index.js';

const DEFAULT_ASK_MAX_TURNS = 30;

export const askSubcommand: Subcommand = {
  name: 'ask',
  description: 'Headless one-shot agent (with tools, --max-turns 30 default)',
  async run(argv, ctx): Promise<number> {
    const { flags, positionals } = parseFlags(argv);
    const prompt = positionals.join(' ').trim();
    if (!prompt) {
      stderr.write('usage: dirgha ask "your prompt" [-m <model>] [-s <system>] [--max-turns N] [--json]\n');
      return 1;
    }
    const config = await loadConfig(ctx.cwd);
    const model = typeof flags.model === 'string' ? flags.model
      : typeof flags.m === 'string' ? flags.m
      : config.model;
    const system = typeof flags.system === 'string' ? flags.system
      : typeof flags.s === 'string' ? flags.s
      : undefined;
    const maxTurns = typeof flags['max-turns'] === 'string'
      ? Number.parseInt(flags['max-turns'], 10)
      : DEFAULT_ASK_MAX_TURNS;
    const json = flags.json === true;

    const providers = new ProviderRegistry();
    const registry = createToolRegistry(builtInTools);
    const sessionId = randomUUID();
    const events = createEventStream();

    if (json) events.subscribe(ev => { stdout.write(`${JSON.stringify(ev)}\n`); });
    else events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));

    const executor = createToolExecutor({ registry, cwd: ctx.cwd, sessionId });
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
    return result.stopReason === 'error' ? 2 : 0;
  },
};
