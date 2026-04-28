/**
 * `dirgha resume <session-id> [prompt...]` — reopen a previously saved
 * session and run a new turn against its history. Without a prompt
 * argument it prints the session's message count + last assistant turn
 * so users can decide whether to continue.
 *
 * Pairs with `dirgha export-session` / `import-session`. Persistence
 * lives in `~/.dirgha/sessions/<id>.jsonl`.
 */

import { stdout, stderr } from 'node:process';
import { runAgentLoop } from '../../kernel/agent-loop.js';
import { createEventStream } from '../../kernel/event-stream.js';
import type { Message } from '../../kernel/types.js';
import { ProviderRegistry } from '../../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../../tools/index.js';
import { renderStreamingEvents } from '../../tui/renderer.js';
import { createSessionStore } from '../../context/session.js';
import { contextWindowFor, findPrice, resolveModelAlias } from '../../intelligence/prices.js';
import { routeModel } from '../../providers/dispatch.js';
import { maybeCompact } from '../../context/compaction.js';
import { appendAudit } from '../../audit/writer.js';
import { loadConfig } from '../config.js';
import { parseFlags } from '../flags.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

export const resumeSubcommand: Subcommand = {
  name: 'resume',
  description: 'Reopen a saved session and continue (dirgha resume <id> [prompt])',
  async run(argv): Promise<number> {
    const { flags, positionals } = parseFlags(argv);
    const sessionId = positionals[0];
    if (!sessionId) {
      stderr.write('usage: dirgha resume <session-id> [new prompt]\n');
      stderr.write('  Find ids via `dirgha stats` (counts) or `ls ~/.dirgha/sessions/`.\n');
      return 2;
    }
    const newPrompt = positionals.slice(1).join(' ').trim();
    const json = flags.json === true;

    const sessions = createSessionStore();
    const session = await sessions.open(sessionId);
    if (!session) {
      stderr.write(`Session ${sessionId} not found in ~/.dirgha/sessions/\n`);
      return 1;
    }

    const history = await session.messages();
    if (history.length === 0) {
      stderr.write(`Session ${sessionId} is empty.\n`);
      return 1;
    }

    if (!newPrompt) {
      // Inspect-only mode: summarise what the session has.
      const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
      stdout.write(style(defaultTheme.accent, `\nResume session ${sessionId}\n`));
      stdout.write(`  ${history.length} message${history.length === 1 ? '' : 's'} on disk\n`);
      if (lastAssistant) {
        const text = typeof lastAssistant.content === 'string'
          ? lastAssistant.content
          : lastAssistant.content.map(p => p.type === 'text' ? p.text : '').join('').trim();
        stdout.write(style(defaultTheme.muted, `  last assistant: ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}\n`));
      }
      stdout.write(`\nPass a prompt as the next argument to continue:\n  dirgha resume ${sessionId} "<your next prompt>"\n`);
      return 0;
    }

    // Run a new turn on top of the existing history.
    const config = await loadConfig();
    const rawModel = typeof flags.model === 'string' ? flags.model : (typeof flags.m === 'string' ? flags.m : config.model);
    const model = resolveModelAlias(rawModel);
    const maxTurns = typeof flags['max-turns'] === 'string' ? Number.parseInt(flags['max-turns'], 10) : config.maxTurns;

    const events = createEventStream();
    if (json) events.subscribe(ev => { stdout.write(`${JSON.stringify(ev)}\n`); });
    else events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));

    const providers = new ProviderRegistry();
    const provider = providers.forModel(model);
    const registry = createToolRegistry(builtInTools);
    const sanitized = registry.sanitize({ descriptionLimit: 200 });
    const executor = createToolExecutor({ registry, cwd: process.cwd(), sessionId });

    // Cost + audit subscribers — same shape as one-shot in main.ts.
    const providerId = routeModel(model);
    const price = findPrice(providerId, model);
    const computeCost = (i: number, o: number, c: number): number => price
      ? (i / 1_000_000) * price.inputPerM + (o / 1_000_000) * price.outputPerM + (c / 1_000_000) * (price.cachedInputPerM ?? 0)
      : 0;
    events.subscribe(async ev => {
      try {
        if (ev.type === 'usage') {
          const cached = ev.cachedTokens ?? 0;
          await session.append({ type: 'usage', ts: new Date().toISOString(), usage: {
            inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, cachedTokens: cached, costUsd: computeCost(ev.inputTokens, ev.outputTokens, cached),
          } });
        }
      } catch { /* swallow */ }
    });
    events.subscribe(ev => {
      if (ev.type === 'tool_exec_end') {
        void appendAudit({ kind: 'tool', actor: sessionId, summary: `${ev.id} ${ev.isError ? 'error' : 'done'} ${ev.durationMs}ms` });
      } else if (ev.type === 'agent_end') {
        void appendAudit({ kind: 'turn-end', actor: sessionId, summary: `model=${model} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}` });
      } else if (ev.type === 'error') {
        void appendAudit({ kind: 'error', actor: sessionId, summary: ev.message });
      }
    });

    // Append the new user message to disk first so a crash mid-turn
    // still leaves a recoverable transcript.
    await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: newPrompt } });
    history.push({ role: 'user', content: newPrompt });

    const messages: Message[] = [...history];
    const result = await runAgentLoop({
      sessionId,
      model,
      messages,
      tools: sanitized.definitions,
      maxTurns,
      provider,
      toolExecutor: executor,
      events,
      contextTransform: async msgs => (await maybeCompact(msgs, {
        triggerTokens: Math.floor(contextWindowFor(model) * 0.75),
        preserveLastTurns: config.compaction.preserveLastTurns,
        summarizer: provider,
        summaryModel: config.summaryModel,
      }, session)).messages,
    });

    // Persist the new turn's outputs (everything past the prior history).
    for (const msg of result.messages.slice(history.length)) {
      try { await session.append({ type: 'message', ts: new Date().toISOString(), message: msg }); } catch { /* swallow */ }
    }
    if (!json) stdout.write('\n');
    return result.stopReason === 'error' ? 2 : 0;
  },
};
