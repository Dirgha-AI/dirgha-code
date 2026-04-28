/**
 * Ink root component for the dirgha TUI.
 *
 * Layout is a single vertical stack:
 *   1. Logo (rendered once inside <Static>, never re-renders)
 *   2. Transcript (finalised user messages + completed turn blocks)
 *   3. LiveTurn (the currently streaming turn, if any)
 *   4. InputBox
 *   5. StatusBar
 *   6. Optional overlay (ModelPicker / HelpOverlay / AtFileComplete)
 *
 * Event → transcript projection lives in `use-event-projection.ts`;
 * overlay state lives in `use-overlays.ts`. This component stays
 * focused on layout and lifecycle.
 */

import * as React from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';
import { randomUUID } from 'node:crypto';
import type { Message } from '../../kernel/types.js';
import type { EventStream } from '../../kernel/event-stream.js';
import { appendAudit } from '../../audit/writer.js';
import { maybeCompact } from '../../context/compaction.js';
import { contextWindowFor } from '../../intelligence/prices.js';
import { buildAgentHooksFromConfig } from '../../hooks/config-bridge.js';
import { loadProjectPrimer, composeSystemPrompt } from '../../context/primer.js';
import { probeGitState, renderGitState } from '../../context/git-state.js';
import { loadSoul } from '../../context/soul.js';
import { modePreamble } from '../../context/mode.js';
import { runAgentLoop } from '../../kernel/agent-loop.js';
import { createErrorClassifier } from '../../intelligence/error-classifier.js';
import type { ProviderRegistry } from '../../providers/index.js';
import type { ToolRegistry } from '../../tools/registry.js';
import { createToolExecutor } from '../../tools/exec.js';
import { createTuiApprovalBus } from '../approval.js';
import type { SessionStore } from '../../context/session.js';
import type { DirghaConfig } from '../../cli/config.js';
import type { SlashRegistry, SlashContext } from '../../cli/slash.js';
import type { Mode } from '../../context/mode.js';
import { appendFileSync } from 'node:fs';
import { PRICES } from '../../intelligence/prices.js';
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { StreamingText } from './components/StreamingText.js';
import { ThinkingBlock } from './components/ThinkingBlock.js';
import { ToolBox } from './components/ToolBox.js';
import { ToolGroup, type ToolItem } from './components/ToolGroup.js';
import { InputBox } from './components/InputBox.js';
import { PromptQueueIndicator } from './components/PromptQueueIndicator.js';
import { ModelPicker, type ModelEntry } from './components/ModelPicker.js';
import { ModelSwitchPrompt } from './components/ModelSwitchPrompt.js';
import { HelpOverlay, type HelpSlashCommand } from './components/HelpOverlay.js';
import { AtFileComplete } from './components/AtFileComplete.js';
import { SlashComplete } from './components/SlashComplete.js';
import { ThemePicker } from './components/ThemePicker.js';
import { ThemeProvider } from './theme-context.js';
import type { ThemeName } from '../theme.js';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { useEventProjection, type TranscriptItem } from './use-event-projection.js';
import { useOverlays } from './use-overlays.js';

import { createRequire } from 'node:module';

// Pulled from the installed package.json so the TUI title matches the
// shipped binary version. Falls back to '0.0.0-dev' if the file isn't
// reachable (e.g. an unusual deploy layout).
const VERSION: string = (() => {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-dev';
  } catch { return '0.0.0-dev'; }
})();

export interface AppProps {
  events: EventStream;
  registry: ToolRegistry;
  providers: ProviderRegistry;
  sessions: SessionStore;
  config: DirghaConfig;
  cwd: string;
  systemPrompt?: string;
  initialMessages?: Message[];
  /** Slash commands to render in the help overlay. Defaults to []. */
  slashCommands?: HelpSlashCommand[];
  /** Model catalogue. Defaults to the prices registry. */
  models?: ModelEntry[];
  /** Slash registry — built by runInkTUI, dispatched on submit. */
  slashRegistry: SlashRegistry;
}

export function App(props: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const sessionIdRef = React.useRef<string>(randomUUID());
  const historyRef = React.useRef<Message[]>(initialHistory(props));
  const abortRef = React.useRef<AbortController | null>(null);

  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  // Prompt queue: while a turn is streaming the user can still type and
  // press Enter. Submissions land here instead of being dropped, then
  // drain FIFO when the turn finishes (see useEffect below).
  const [promptQueue, setPromptQueue] = React.useState<string[]>([]);
  const [currentModel, setCurrentModel] = React.useState(props.config.model);
  // Pending model-switch prompt — set when the kernel emits an error
  // with a `failoverModel` hint. Cleared when the user answers
  // [y|n|p]. While set, an inline ModelSwitchPrompt renders below
  // the input box; submitting any other prompt also clears it.
  const [pendingFailover, setPendingFailover] = React.useState<{
    failedModel: string;
    failoverModel: string;
    /** The user prompt that triggered the failed turn — re-submit on accept. */
    lastPrompt: string;
  } | null>(null);
  const lastUserPromptRef = React.useRef<string>('');
  // Mode state: SlashContext.setMode flips it live so /mode plan|act|verify|ask
  // takes effect on the next turn (system-prompt rebuild downstream picks it up).
  const [mode, setMode] = React.useState<Mode>(
    (props.config.mode as Mode | undefined) ?? 'act',
  );
  const projection = useEventProjection(props.events);
  const overlays = useOverlays();
  // Live counters for the in-progress turn — drive the StatusBar
  // tok/s readout. Reset at agent_start, accumulate output deltas,
  // refresh tick at 250 ms so the rate updates visibly.
  const [liveOutputTokens, setLiveOutputTokens] = React.useState(0);
  const [liveDurationMs, setLiveDurationMs] = React.useState(0);
  const turnStartRef = React.useRef<number>(0);

  React.useEffect(() => {
    const unsub = props.events.subscribe(ev => {
      if (ev.type === 'agent_start') {
        turnStartRef.current = Date.now();
        setLiveOutputTokens(0);
        setLiveDurationMs(0);
      } else if (ev.type === 'text_delta' || ev.type === 'thinking_delta') {
        // Approximate output-token count by char/4 — same heuristic
        // the rest of the codebase uses for streaming-side estimates.
        const delta = (ev.delta?.length ?? 0) / 4;
        setLiveOutputTokens(prev => prev + delta);
      } else if (ev.type === 'usage') {
        setLiveOutputTokens(ev.outputTokens ?? 0);
      } else if (ev.type === 'agent_end') {
        setLiveDurationMs(0);
        setLiveOutputTokens(0);
      }
    });
    return unsub;
  }, [props.events]);

  // Tick the duration so the tok/s number updates while streaming.
  React.useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      if (turnStartRef.current > 0) setLiveDurationMs(Date.now() - turnStartRef.current);
    }, 250);
    return () => clearInterval(t);
  }, [busy]);

  // Audit writer for the Ink TUI path. Mirrors the one-shot main.ts and
  // readline runInteractive subscribers — without this, `dirgha audit`
  // is empty for the most common surface (the interactive UI). Effect
  // re-installs only if events ref changes (it shouldn't).
  React.useEffect(() => {
    const unsub = props.events.subscribe(ev => {
      if (ev.type === 'tool_exec_end') {
        void appendAudit({ kind: 'tool', actor: sessionIdRef.current, summary: `${ev.id} ${ev.isError ? 'error' : 'done'} ${ev.durationMs}ms`, toolId: ev.id, isError: ev.isError, durationMs: ev.durationMs });
      } else if (ev.type === 'agent_end') {
        void appendAudit({ kind: 'turn-end', actor: sessionIdRef.current, summary: `model=${currentModel} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}`, model: currentModel, stopReason: ev.stopReason, usage: ev.usage });
      } else if (ev.type === 'error') {
        void appendAudit({ kind: 'error', actor: sessionIdRef.current, summary: ev.message });
        if (ev.failoverModel) {
          setPendingFailover({
            failedModel: currentModel,
            failoverModel: ev.failoverModel,
            lastPrompt: lastUserPromptRef.current,
          });
        }
      }
    });
    return unsub;
  }, [props.events, currentModel]);

  const models = React.useMemo<ModelEntry[]>(() => props.models ?? defaultModelCatalogue(), [props.models]);
  const slashCommands = props.slashCommands ?? [];

  const handleSubmit = React.useCallback((raw: string): void => {
    const value = raw.trim();
    if (value.length === 0) return;
    // Non-disruptive queue: if a turn is still streaming, push the new
    // prompt onto the queue and clear the input so the user can keep
    // typing. The drain-effect below submits queued prompts FIFO once
    // `busy` flips false.
    if (busy) {
      setPromptQueue(q => [...q, value]);
      setInput('');
      return;
    }
    setInput('');
    // Remember the last user prompt so we can re-submit it after a
    // failover model swap (D2 — auto-prompt model switch on failure).
    lastUserPromptRef.current = value;
    // A new submission supersedes any pending failover prompt.
    setPendingFailover(null);

    if (value === '/exit' || value === '/quit') {
      exit();
      return;
    }
    if (value === '/clear') {
      historyRef.current = initialHistory(props);
      setTranscript([]);
      projection.clear();
      return;
    }
    // `/model` with no args opens the picker; `/model <id>` sets directly.
    if (value === '/model' || value === '/models') {
      overlays.openOverlay('models');
      return;
    }
    if (value.startsWith('/model ')) {
      const id = value.slice('/model '.length).trim();
      if (id !== '') {
        setCurrentModel(id);
        const note: TranscriptItem = { kind: 'notice', id: randomUUID(), text: `Model set to ${id}` };
        setTranscript(prev => [...prev, note]);
      }
      return;
    }
    if (value === '/help' || value === '/?') {
      overlays.openOverlay('help');
      return;
    }
    // `/theme` with no args opens the picker; `/theme <name>` sets directly.
    if (value === '/theme' || value === '/themes') {
      overlays.openOverlay('theme');
      return;
    }

    // Anything else starting with `/` goes through the SlashRegistry — that
    // covers /init /keys /memory /compact /setup /login /status /resume
    // /session /history /fleet /account /upgrade /config /mode and friends.
    // The hardcoded branches above (clear/help/model[s]/theme) ran first
    // because they open Ink overlays and don't fit the registry string-output
    // contract. Without this dispatch, unrecognised slash commands fell
    // through to runTurn() and were sent to the LLM as user prompts —
    // surprising behaviour that S1/2026-04-27 fixes.
    if (value.startsWith('/')) {
      const ctx: SlashContext = {
        get model() { return currentModel; },
        get sessionId() { return sessionIdRef.current; },
        setModel: (m: string) => setCurrentModel(m),
        showHelp: () => '',
        compact: async () => '(compaction is automatic)',
        clear: () => {
          historyRef.current = initialHistory(props);
          setTranscript([]);
          projection.clear();
        },
        listSessions: async () => {
          const ids = await props.sessions.list();
          return ids.length === 0 ? '(no saved sessions)' : ids.map(id => `- ${id}`).join('\n');
        },
        loadSession: async (id: string) => {
          const s = await props.sessions.open(id);
          return s ? `Loaded ${id}.` : `Session ${id} not found.`;
        },
        listSkills: async () => '(run `dirgha skills` for the full list)',
        showCost: () => `model=${currentModel}`,
        exit: (code = 0) => { exit(); process.exit(code); },
        getToken: () => null,
        setToken: () => undefined,
        apiBase: () => process.env['DIRGHA_API_BASE'] ?? process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai',
        upgradeUrl: () => process.env['DIRGHA_UPGRADE_URL'] ?? 'https://dirgha.ai/billing/upgrade',
        status: (msg: string) => {
          setTranscript(prev => [...prev, { kind: 'notice', id: randomUUID(), text: msg }]);
        },
        getMode: () => mode,
        setMode: (m: Mode) => setMode(m),
        getTheme: () => ((props.config.theme as ThemeName | undefined) ?? 'readable'),
        setTheme: () => undefined,
        getSession: () => null,
        getSessionStore: () => props.sessions,
        getProvider: () => props.providers.forModel(currentModel),
        getSummaryModel: () => props.config.summaryModel,
      };
      void (async () => {
        try {
          const result = await props.slashRegistry.dispatch(value, ctx);
          if (result.handled) {
            const text = result.output ? String(result.output) : '(ok)';
            setTranscript(prev => [...prev, { kind: 'notice', id: randomUUID(), text }]);
          } else {
            setTranscript(prev => [...prev, {
              kind: 'notice',
              id: randomUUID(),
              text: `Unknown command: ${value.split(' ')[0]}. Type /help for the list.`,
            }]);
          }
        } catch (err) {
          setTranscript(prev => [...prev, {
            kind: 'notice',
            id: randomUUID(),
            text: `[slash error] ${err instanceof Error ? err.message : String(err)}`,
          }]);
        }
      })();
      return;
    }

    const userItem: TranscriptItem = { kind: 'user', id: randomUUID(), text: value };
    setTranscript(prev => [...prev, userItem]);
    historyRef.current.push({ role: 'user', content: value });

    void runTurn();
  }, [busy, exit, props, projection, overlays]);

  const runTurn = async (): Promise<void> => {
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const executor = createToolExecutor({
        registry: props.registry,
        cwd: props.cwd,
        sessionId: sessionIdRef.current,
      });
      const sanitized = props.registry.sanitize({ descriptionLimit: 200 });
      const provider = props.providers.forModel(currentModel);
      const approvalBus = createTuiApprovalBus(new Set(props.config.autoApproveTools));

      // Context-aware compaction: trigger at 75 % of the active model's
      // window. Same machinery as the readline + one-shot paths so the
      // Ink TUI doesn't 400-overflow on long sessions.
      const compactionTransform = async (msgs: Message[]): Promise<Message[]> => (
        await maybeCompact(msgs, {
          triggerTokens: Math.floor(contextWindowFor(currentModel) * 0.75),
          preserveLastTurns: props.config.compaction?.preserveLastTurns ?? 6,
          summarizer: provider,
          summaryModel: props.config.summaryModel ?? currentModel,
        })
      ).messages;

      const userHooks = buildAgentHooksFromConfig(props.config);
      const result = await runAgentLoop({
        sessionId: sessionIdRef.current,
        model: currentModel,
        messages: historyRef.current,
        tools: sanitized.definitions,
        maxTurns: props.config.maxTurns,
        provider,
        toolExecutor: executor,
        approvalBus,
        events: props.events,
        signal: abort.signal,
        contextTransform: compactionTransform,
        errorClassifier: createErrorClassifier(),
        ...(userHooks !== undefined ? { hooks: userHooks } : {}),
      });
      historyRef.current = result.messages;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      projection.appendLive({ kind: 'error', id: randomUUID(), message: msg });
    } finally {
      const committed = projection.commitLive();
      if (committed.length > 0) setTranscript(prev => [...prev, ...committed]);
      setBusy(false);
      abortRef.current = null;
    }
  };

  // Drain the prompt queue when a turn finishes. Pops the oldest queued
  // prompt and re-submits it through handleSubmit (which transitions
  // back into busy=true via runTurn). Guarded on `!busy` so we never
  // race against an already-active turn.
  React.useEffect(() => {
    if (busy) return;
    if (promptQueue.length === 0) return;
    const [next, ...rest] = promptQueue;
    setPromptQueue(rest);
    if (next !== undefined) handleSubmit(next);
  }, [busy, promptQueue, handleSubmit]);

  // Global Esc handler. Priority order:
  //   1. If an overlay (other than @-file) is open → close it.
  //   2. If a turn is streaming → abort it (cancels the in-flight LLM
  //      request via the AbortController plumbed through runAgentLoop).
  //   3. If the input box has draft text → clear it.
  // Always active so Esc behaves like the user expects regardless of
  // which surface they're looking at. The atfile overlay handles its
  // own Esc (cancel completion) so we skip step 1 there.
  useInput((_ch, key) => {
    if (!key.escape) return;
    if (overlays.active !== null && overlays.active !== 'atfile') {
      overlays.closeOverlay();
      return;
    }
    if (busy && abortRef.current !== null) {
      abortRef.current.abort();
      projection.appendLive({ kind: 'notice', id: randomUUID(), text: 'Cancelled.' });
      return;
    }
    if (input.length > 0) setInput('');
  });

  const handleModelPick = React.useCallback((id: string): void => {
    overlays.closeOverlay();
    // Dedupe: a stale picker callback firing after the model is already
    // set should not spam the transcript with redundant notices.
    setCurrentModel(prev => {
      if (prev === id) return prev;
      const note: TranscriptItem = { kind: 'notice', id: randomUUID(), text: `Model set to ${id}` };
      setTranscript(t => [...t, note]);
      return id;
    });
  }, [overlays]);

  const handleAtPick = React.useCallback((path: string): void => {
    setInput(current => overlays.spliceAtSelection(current, path));
    overlays.setAtQuery(null);
    overlays.setActive(null);
  }, [overlays]);

  const handleSlashPick = React.useCallback((name: string): void => {
    // Replace the leading /<typed> with /<picked> + a trailing space so
    // the user can immediately type arguments. If there's already a
    // tail (rare — only if they pasted), preserve it.
    setInput(current => {
      const spliced = overlays.spliceSlashSelection(current, name);
      return spliced === `/${name}` ? `${spliced} ` : spliced;
    });
    // Clear the slash query — the useEffect in use-overlays then closes
    // the picker overlay automatically. We deliberately do NOT call
    // `overlays.setActive(null)` here: when the user presses Enter, both
    // SlashComplete (this onPick) and InputBox (its onSubmit) fire in
    // the same batched render. If onSubmit calls openOverlay('theme'),
    // an explicit setActive(null) from this handler would race and
    // overwrite it — that's the bug that shipped to v1.7.8 and made
    // /theme silently no-op.
    overlays.setSlashQuery(null);
  }, [overlays]);

  const inputFocus = overlays.active === null || overlays.active === 'atfile' || overlays.active === 'slash';

  // Active theme name — driven by local state so the picker can flip it
  // live. Initial value comes from config; subsequent changes are
  // persisted to ~/.dirgha/config.json so future sessions pick it up.
  const [themeName, setThemeName] = React.useState<ThemeName>(
    (props.config.theme ?? 'readable') as ThemeName,
  );

  const handleThemePick = React.useCallback((name: ThemeName): void => {
    overlays.closeOverlay();
    setThemeName(name);
    const note: TranscriptItem = { kind: 'notice', id: randomUUID(), text: `Theme set to ${name}` };
    setTranscript(t => [...t, note]);
    void (async (): Promise<void> => {
      try {
        const dir = pathJoin(homedir(), '.dirgha');
        await mkdir(dir, { recursive: true });
        const path = pathJoin(dir, 'config.json');
        const text = await readFile(path, 'utf8').catch(() => '');
        const cfg = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        cfg.theme = name;
        await writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
      } catch { /* best-effort persistence */ }
    })();
  }, [overlays]);

  // BISECT: Static moved out of the transcript render. Logo stays
  // in a one-item Static (its original placement). Both committed
  // transcript and live items render in the regular dynamic Box. If
  // streaming text appears now, the Static-around-transcript pattern
  // was suppressing the live region updates. If still not, the bug
  // is upstream in useEventProjection.
  return (
    <ThemeProvider activeTheme={themeName}>
    <Box flexDirection="column">
      <Static items={[{ key: 'logo' }]}>
        {(_item): React.JSX.Element => <Logo key="logo" version={VERSION} />}
      </Static>
      <Box flexDirection="column">
        {renderTranscript([...transcript, ...projection.liveItems])}
      </Box>
      {pendingFailover !== null && (
        <ModelSwitchPrompt
          failedModel={pendingFailover.failedModel}
          failoverModel={pendingFailover.failoverModel}
          onAccept={(failover): void => {
            const lastPrompt = pendingFailover.lastPrompt;
            setCurrentModel(failover);
            setPendingFailover(null);
            // Re-submit the failed prompt against the new model.
            if (lastPrompt) {
              setTimeout(() => handleSubmit(lastPrompt), 0);
            }
          }}
          onReject={(): void => setPendingFailover(null)}
          onPicker={(): void => {
            setPendingFailover(null);
            overlays.openOverlay('models');
          }}
        />
      )}
      <PromptQueueIndicator queued={promptQueue} />
      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        busy={busy}
        vimMode={props.config.vimMode === true}
        onAtQueryChange={overlays.setAtQuery}
        onSlashQueryChange={overlays.setSlashQuery}
        onRequestOverlay={overlays.openOverlay}
        inputFocus={inputFocus}
      />
      {overlays.active === 'atfile' && overlays.atQuery !== null && (
        <AtFileComplete
          cwd={props.cwd}
          query={overlays.atQuery}
          onPick={handleAtPick}
          onCancel={(): void => { overlays.setAtQuery(null); overlays.setActive(null); }}
        />
      )}
      {overlays.active === 'slash' && overlays.slashQuery !== null && (
        <SlashComplete
          commands={slashCommands}
          query={overlays.slashQuery}
          onPick={handleSlashPick}
          onCancel={(): void => { overlays.setSlashQuery(null); overlays.setActive(null); }}
        />
      )}
      {overlays.active === 'models' && (
        <ModelPicker
          models={models}
          current={currentModel}
          onPick={handleModelPick}
          onCancel={overlays.closeOverlay}
        />
      )}
      {overlays.active === 'help' && (
        <HelpOverlay
          slashCommands={slashCommands}
          onClose={overlays.closeOverlay}
        />
      )}
      {overlays.active === 'theme' && (
        <ThemePicker
          current={themeName}
          onPick={handleThemePick}
          onCancel={overlays.closeOverlay}
        />
      )}
      <StatusBar
        model={currentModel}
        provider={providerIdForModel(currentModel)}
        inputTokens={projection.totals.inputTokens}
        outputTokens={projection.totals.outputTokens}
        costUsd={projection.totals.costUsd}
        cwd={props.cwd}
        busy={busy}
        mode={props.config.mode ?? 'act'}
        contextWindow={contextWindowFor(currentModel)}
        liveOutputTokens={liveOutputTokens}
        liveDurationMs={liveDurationMs}
      />
    </Box>
    </ThemeProvider>
  );
}

/**
 * Walk the transcript and fold consecutive `tool` items into a single
 * <ToolGroup>. Non-tool items render via <TranscriptRow>. The grouping
 * is intentionally simple — we look at adjacency, not assistant-turn
 * boundaries, because the projection emits tools contiguously between
 * `text` spans of the same turn.
 */
function renderTranscript(items: TranscriptItem[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let toolBuf: ToolItem[] = [];
  let groupKeyCounter = 0;

  const flushTools = (): void => {
    if (toolBuf.length === 0) return;
    out.push(<ToolGroup key={`tg-${groupKeyCounter++}`} tools={toolBuf} />);
    toolBuf = [];
  };

  for (const item of items) {
    if (item.kind === 'tool') {
      toolBuf.push({
        id: item.id,
        name: item.name,
        status: item.status,
        argSummary: item.argSummary,
        outputPreview: item.outputPreview,
        startedAt: item.startedAt,
        durationMs: item.durationMs,
      });
      continue;
    }
    flushTools();
    out.push(<TranscriptRow key={item.id} item={item} />);
  }
  flushTools();
  return out;
}

function TranscriptRow({ item }: { item: TranscriptItem }): React.JSX.Element | null {
  switch (item.kind) {
    case 'user':
      return (
        <Box gap={2} marginBottom={1}>
          <Text color="magenta">❯</Text>
          <Text color="white">{item.text}</Text>
        </Box>
      );
    case 'text':
      return <StreamingText content={item.content} />;
    case 'thinking':
      return <ThinkingBlock content={item.content} />;
    case 'tool':
      // Should not be reached — tools are folded by renderTranscript() into
      // <ToolGroup>. Kept as a safety net so an unexpected tool item still
      // renders something rather than nothing.
      return (
        <ToolBox
          name={item.name}
          status={item.status}
          argSummary={item.argSummary}
          outputPreview={item.outputPreview}
          startedAt={item.startedAt}
          durationMs={item.durationMs}
        />
      );
    case 'error':
      return (
        <Box gap={1} marginBottom={1}>
          <Text color="red" bold>✗</Text>
          <Text color="red">{item.message}</Text>
        </Box>
      );
    case 'notice':
      return (
        <Box marginBottom={1}>
          <Text color="yellow">{item.text}</Text>
        </Box>
      );
  }
}

function initialHistory(props: AppProps): Message[] {
  const base = props.initialMessages ? [...props.initialMessages] : [];
  // Boot context: mode preamble + project primer (DIRGHA.md) +
  // caller's --system. Without this, the Ink TUI starts with zero
  // project awareness — same parity-matrix #1 fix as the one-shot
  // path in cli/main.ts.
  const primer = loadProjectPrimer(props.cwd);
  const soul = loadSoul();
  const composedSystem = composeSystemPrompt({
    soul: soul.text,
    modePreamble: modePreamble(props.config.mode ?? 'act'),
    primer: primer.primer,
    gitState: renderGitState(probeGitState(props.cwd)),
    userSystem: props.systemPrompt,
  });
  base.unshift({ role: 'system', content: composedSystem });
  return base;
}

function providerIdForModel(model: string): string {
  // Light heuristic so StatusBar has a hint without importing dispatch.
  // Real routing still lives in providers/dispatch.ts at run time.
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.includes('gemini')) return 'gemini';
  if (model.includes('kimi') || model.includes('moonshot')) return 'nvidia';
  if (model.includes('llama') || model.includes('nvidia') || model.includes('minimax')) return 'nvidia';
  if (model.includes('fireworks')) return 'fireworks';
  if (model.includes('/')) return 'openrouter';
  return 'local';
}

function defaultModelCatalogue(): ModelEntry[] {
  return PRICES.map(p => ({
    id: p.model,
    provider: p.provider,
    tier: tierFromPrice(p.inputPerM),
  }));
}

function tierFromPrice(inputPerM: number): ModelEntry['tier'] {
  if (inputPerM === 0) return 'free';
  if (inputPerM < 0.5) return 'basic';
  if (inputPerM < 5) return 'pro';
  return 'premium';
}
