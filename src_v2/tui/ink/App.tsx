/**
 * Ink root component for the dirgha TUI.
 *
 * Layout is a single vertical stack:
 *   1. Logo (rendered once inside <Static>, never re-renders)
 *   2. Transcript (finalised user messages + completed turn blocks)
 *   3. LiveTurn (the currently streaming turn, if any)
 *   4. InputBox
 *   5. StatusBar
 *
 * Event → transcript projection lives in `use-event-projection.ts` so
 * this component stays focused on layout and lifecycle.
 */

import * as React from 'react';
import { Box, Static, Text, useApp } from 'ink';
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
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { StreamingText } from './components/StreamingText.js';
import { ThinkingBlock } from './components/ThinkingBlock.js';
import { ToolBox } from './components/ToolBox.js';
import { InputBox } from './components/InputBox.js';
import { useEventProjection, type TranscriptItem } from './use-event-projection.js';

const VERSION = '0.2.0';

export interface AppProps {
  events: EventStream;
  registry: ToolRegistry;
  providers: ProviderRegistry;
  sessions: SessionStore;
  config: DirghaConfig;
  cwd: string;
  systemPrompt?: string;
  initialMessages?: Message[];
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

  // When a turn ends and agent_end fires, we don't commit here —
  // commitLive runs in runTurn's finally so we also capture any
  // fatal errors appended by the catch block.
  void setCurrentModel;

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

    const userItem: TranscriptItem = { kind: 'user', id: randomUUID(), text: value };
    setTranscript(prev => [...prev, userItem]);
    historyRef.current.push({ role: 'user', content: value });

    void runTurn();
  }, [busy, exit, props, projection]);

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
      />
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
