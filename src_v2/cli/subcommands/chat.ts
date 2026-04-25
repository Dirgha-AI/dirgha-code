/**
 * `dirgha chat "prompt"` — pure LLM chat, no tool calls.
 *
 * Skips the agent loop entirely: opens a streaming provider connection,
 * prints text deltas as they arrive, and exits. No tool execution, no
 * session persistence (beyond the transient event prints). Useful for
 * quick Q&A where you explicitly do *not* want the agent touching the
 * filesystem or shelling out.
 *
 * Flags mirror the one-shot path on main.ts: `-m`, `-s`, `--json`.
 */

import { stdout, stderr } from 'node:process';
import { parseFlags } from '../flags.js';
import { loadConfig } from '../config.js';
import { ProviderRegistry } from '../../providers/index.js';
import type { Message, AgentEvent } from '../../kernel/types.js';
import type { Subcommand } from './index.js';

async function consume(stream: AsyncIterable<AgentEvent>, json: boolean): Promise<void> {
  for await (const ev of stream) {
    if (json) { stdout.write(`${JSON.stringify(ev)}\n`); continue; }
    if (ev.type === 'text_delta') stdout.write(ev.delta);
    else if (ev.type === 'text_end') stdout.write('');
    else if (ev.type === 'turn_end') stdout.write('\n');
    else if (ev.type === 'error') stderr.write(`\nerror: ${ev.message}\n`);
  }
}

export const chatSubcommand: Subcommand = {
  name: 'chat',
  description: 'Pure chat turn (no tools) — one-shot LLM call',
  async run(argv, ctx): Promise<number> {
    const { flags, positionals } = parseFlags(argv);
    const prompt = positionals.join(' ').trim();
    if (!prompt) {
      stderr.write('usage: dirgha chat "your prompt" [-m <model>] [-s <system>] [--json]\n');
      return 1;
    }
    const config = await loadConfig(ctx.cwd);
    const { resolveModelAlias } = await import('../../intelligence/prices.js');
    const rawModel = typeof flags.model === 'string' ? flags.model
      : typeof flags.m === 'string' ? flags.m
      : config.model;
    const model = resolveModelAlias(rawModel);
    const system = typeof flags.system === 'string' ? flags.system
      : typeof flags.s === 'string' ? flags.s
      : undefined;
    const tempRaw = typeof flags.temperature === 'string' ? flags.temperature
      : typeof flags.t === 'string' ? flags.t
      : undefined;
    const tempParsed = tempRaw !== undefined ? Number.parseFloat(tempRaw) : Number.NaN;
    const temperature = Number.isFinite(tempParsed) ? tempParsed : undefined;
    const json = flags.json === true;

    const providers = new ProviderRegistry();
    const provider = providers.forModel(model);

    const messages: Message[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    try {
      const stream = provider.stream({ model, messages, temperature });
      await consume(stream, json);
      return 0;
    } catch (err) {
      stderr.write(`\nfatal: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
  },
};
