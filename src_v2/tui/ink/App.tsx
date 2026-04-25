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
import { runAgentLoop } from '../../kernel/agent-loop.js';
import type { ProviderRegistry } from '../../providers/index.js';
import type { ToolRegistry } from '../../tools/registry.js';
import { createToolExecutor } from '../../tools/exec.js';
import { createTuiApprovalBus } from '../approval.js';
import type { SessionStore } from '../../context/session.js';
import type { DirghaConfig } from '../../cli/config.js';
import { PRICES } from '../../intelligence/prices.js';
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { StreamingText } from './components/StreamingText.js';
import { ThinkingBlock } from './components/ThinkingBlock.js';
import { ToolBox } from './components/ToolBox.js';
import { InputBox } from './components/InputBox.js';
import { ModelPicker, type ModelEntry } from './components/ModelPicker.js';
import { HelpOverlay, type HelpSlashCommand } from './components/HelpOverlay.js';
import { AtFileComplete } from './components/AtFileComplete.js';
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
}

export function App(props: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const sessionIdRef = React.useRef<string>(randomUUID());
  const historyRef = React.useRef<Message[]>(initialHistory(props));
  const abortRef = React.useRef<AbortController | null>(null);

  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [currentModel, setCurrentModel] = React.useState(props.config.model);
  const projection = useEventProjection(props.events);
  const overlays = useOverlays();

  const models = React.useMemo<ModelEntry[]>(() => props.models ?? defaultModelCatalogue(), [props.models]);
  const slashCommands = props.slashCommands ?? [];

  const handleSubmit = React.useCallback((raw: string): void => {
    const value = raw.trim();
    if (value.length === 0 || busy) return;
    setInput('');

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
    setCurrentModel(id);
    overlays.closeOverlay();
    const note: TranscriptItem = { kind: 'notice', id: randomUUID(), text: `Model set to ${id}` };
    setTranscript(prev => [...prev, note]);
  }, [overlays]);

  const handleAtPick = React.useCallback((path: string): void => {
    setInput(current => overlays.spliceAtSelection(current, path));
    overlays.setAtQuery(null);
    overlays.setActive(null);
  }, [overlays]);

  const inputFocus = overlays.active === null || overlays.active === 'atfile';

  return (
    <Box flexDirection="column">
      <Static items={[{ key: 'logo' }]}>
        {(_item): React.JSX.Element => <Logo key="logo" version={VERSION} />}
      </Static>
      <Box flexDirection="column">
        {transcript.map(item => (
          <TranscriptRow key={item.id} item={item} />
        ))}
        {projection.liveItems.map(item => (
          <TranscriptRow key={item.id} item={item} />
        ))}
      </Box>
      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        busy={busy}
        vimMode={props.config.vimMode === true}
        onAtQueryChange={overlays.setAtQuery}
        onRequestOverlay={overlays.openOverlay}
        inputFocus={inputFocus && !busy}
      />
      {overlays.active === 'atfile' && overlays.atQuery !== null && (
        <AtFileComplete
          cwd={props.cwd}
          query={overlays.atQuery}
          onPick={handleAtPick}
          onCancel={(): void => { overlays.setAtQuery(null); overlays.setActive(null); }}
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
      <StatusBar
        model={currentModel}
        provider={providerIdForModel(currentModel)}
        inputTokens={projection.totals.inputTokens}
        outputTokens={projection.totals.outputTokens}
        costUsd={projection.totals.costUsd}
        cwd={props.cwd}
        busy={busy}
      />
    </Box>
  );
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
  if (props.systemPrompt) base.unshift({ role: 'system', content: props.systemPrompt });
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
