/**
 * Interactive REPL. A thin readline loop that routes user input either
 * to the agent loop (regular prompts) or to the slash registry
 * (commands starting with /). Streaming output is rendered via the TUI
 * renderer subscribed to the shared event stream.
 */

import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { Message, UsageTotal } from '../kernel/types.js';
import { createEventStream } from '../kernel/event-stream.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import type { ProviderRegistry } from '../providers/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import { createToolExecutor } from '../tools/exec.js';
import { renderStreamingEvents } from '../tui/renderer.js';
import { defaultTheme, style } from '../tui/theme.js';
import { createTuiApprovalBus } from '../tui/approval.js';
import type { SessionStore, Session } from '../context/session.js';
import { maybeCompact } from '../context/compaction.js';
import { createDefaultSlashRegistry, registerBuiltinSlashCommands } from './slash.js';
import type { DirghaConfig } from './config.js';

export interface InteractiveOptions {
  registry: ToolRegistry;
  providers: ProviderRegistry;
  sessions: SessionStore;
  config: DirghaConfig;
  cwd: string;
  systemPrompt?: string;
  initialMessages?: Message[];
}

export async function runInteractive(opts: InteractiveOptions): Promise<void> {
  const sessionId = randomUUID();
  const session = await opts.sessions.create(sessionId);
  const events = createEventStream();
  const slash = createDefaultSlashRegistry();
  await registerBuiltinSlashCommands(slash);
  const approvalBus = createTuiApprovalBus(new Set(opts.config.autoApproveTools));
  const render = renderStreamingEvents({ showThinking: opts.config.showThinking });

  events.subscribe(render);

  let currentModel = opts.config.model;
  const history: Message[] = [...(opts.initialMessages ?? [])];
  if (opts.systemPrompt) history.unshift({ role: 'system', content: opts.systemPrompt });
  const totals: UsageTotal = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
  events.subscribe(ev => {
    if (ev.type === 'usage') {
      totals.inputTokens += ev.inputTokens;
      totals.outputTokens += ev.outputTokens;
      totals.cachedTokens += ev.cachedTokens ?? 0;
    }
  });

  process.stdout.write(style(defaultTheme.accent, '\ndirgha-cli interactive mode.  /help for commands.\n\n'));

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: style(defaultTheme.userPrompt, '❯ ') });
  rl.prompt();

  rl.on('line', line => { void handleLine(line); });
  rl.on('close', () => process.exit(0));

  const handleLine = async (raw: string): Promise<void> => {
    const line = raw.trim();
    if (line.length === 0) { rl.prompt(); return; }

    if (line.startsWith('/')) {
      const ctx = buildSlashCtx(session, opts, {
        get model() { return currentModel; },
        set model(v) { currentModel = v; },
      }, totals, () => history.length = 0, () => rl.close());
      const result = await slash.dispatch(line, ctx);
      if (result.output) process.stdout.write(`${result.output}\n`);
      rl.prompt();
      return;
    }

    history.push({ role: 'user', content: line });
    await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: line } });

    const executor = createToolExecutor({ registry: opts.registry, cwd: opts.cwd, sessionId });
    const sanitized = opts.registry.sanitize({ descriptionLimit: 200 });
    const provider = opts.providers.forModel(currentModel);

    try {
      const result = await runAgentLoop({
        sessionId,
        model: currentModel,
        messages: history,
        tools: sanitized.definitions,
        maxTurns: opts.config.maxTurns,
        provider,
        toolExecutor: executor,
        approvalBus,
        events,
        contextTransform: async msgs => (await maybeCompact(msgs, {
          triggerTokens: opts.config.compaction.triggerTokens,
          preserveLastTurns: opts.config.compaction.preserveLastTurns,
          summarizer: provider,
          summaryModel: opts.config.summaryModel,
        }, session)).messages,
      });
      history.length = 0;
      history.push(...result.messages);
      for (const msg of result.messages.slice(-4)) {
        await session.append({ type: 'message', ts: new Date().toISOString(), message: msg });
      }
    } catch (err) {
      process.stdout.write(style(defaultTheme.danger, `\n[fatal] ${err instanceof Error ? err.message : String(err)}\n`));
    }
    rl.prompt();
  };
}

function buildSlashCtx(
  session: Session,
  opts: InteractiveOptions,
  modelRef: { model: string },
  totals: UsageTotal,
  clearHistory: () => void,
  exit: () => void,
) {
  return {
    get model() { return modelRef.model; },
    get sessionId() { return session.id; },
    setModel(value: string) { modelRef.model = value; },
    showHelp(): string {
      return [
        'Slash commands:',
        '  /help              Show this message',
        '  /model [id]        Show or switch model',
        '  /compact           Manually compact history',
        '  /clear             Clear transcript (keeps session on disk)',
        '  /session list      List saved sessions',
        '  /session load <id> Load a session',
        '  /skills            List skills available for this turn',
        '  /cost              Show cumulative usage',
        '  /exit, /quit       Exit',
      ].join('\n');
    },
    async compact(): Promise<string> {
      return '(compact runs automatically each turn; use /cost to inspect usage.)';
    },
    clear(): void {
      clearHistory();
      process.stdout.write(style(defaultTheme.success, '(transcript cleared)\n'));
    },
    async listSessions(): Promise<string> {
      const ids = await opts.sessions.list();
      return ids.length === 0 ? '(no saved sessions)' : ids.map(id => `- ${id}`).join('\n');
    },
    async loadSession(id: string): Promise<string> {
      const next = await opts.sessions.open(id);
      if (!next) return `Session ${id} not found.`;
      return `Loaded ${id}. Previous messages: ${(await next.messages()).length}.`;
    },
    async listSkills(): Promise<string> {
      return '(skills system is wired; run `dirgha skills` for full detail.)';
    },
    showCost(): string {
      return `tokens in=${totals.inputTokens} out=${totals.outputTokens} cached=${totals.cachedTokens} cost=$${totals.costUsd.toFixed(4)}`;
    },
    exit(code = 0): void { exit(); process.exit(code); },
  };
}
