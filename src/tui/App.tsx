/**
 * tui/App.tsx — Root DirghaApp component with NON-BLOCKING input
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import type { Message, ReplContext } from '../types.js';
import { consoleStream } from '../types.js';
import { LiveView, ActivitySummary, type ActiveTurn } from './components/LiveView.js';
import { detectProvider, getDefaultModel } from '../agent/gateway.js';
import { runAgentLoop, buildSystemPrompt } from '../agent/loop.js';
import { resolveModel, classifyQuery } from '../agent/routing.js';
import { handleSlash, autoCompleteSlash } from '../repl/slash/index.js';
import { syncSession } from '../sync/session.js';
import { isProjectInitialized } from '../utils/config.js';
import { isLoggedIn, isConfigured } from '../utils/credentials.js';
import { SPIN, LOGO, MODELS, type ChatMsg } from './constants.js';
import { C } from './colors.js';
import { uid, renderMd, modelLabel, provLabel, MarkdownBuffer, loadHistory, saveHistory, openInEditor } from './helpers.js';
import { kb } from './keybindings.js';
import { trackProject } from '../utils/project-tracker.js';
import { writeState } from '../utils/state.js';
import { loadDBSession, saveDBSession } from '../session/persistence.js';
import { logger } from '../utils/logger.js';
import { StatusBar } from './components/StatusBar.js';
import { ModelPicker } from './components/ModelPicker.js';
import { KeysPicker } from './components/KeysPicker.js';
import { SlashHint } from './components/SlashHint.js';
import { CompletedMsg } from './components/CompletedMsg.js';
import { HistorySearch } from './components/HistorySearch.js';
import { FileComplete } from './components/FileComplete.js';
import { SessionPicker, type SessionEntry } from './components/SessionPicker.js';
import { ScrollView } from './components/ScrollView.js';
import { InputBox } from './components/InputBox.js';
import { TaskQueue, type QueuedTask, initTaskQueue } from './TaskQueue.js';

export function DirghaApp({ initialPrompt, resumeSessionId, maxBudgetUsd }: { initialPrompt?: string; resumeSessionId?: string; maxBudgetUsd?: number }) {
  const { exit } = useApp();
  const sessionId  = useRef(uid());
  const ctxRef     = useRef<ReplContext | null>(null);
  const llmHistory = useRef<Message[]>([]);
  const ctrlXArmed = useRef(false);
  const ctrlCArmed = useRef(false);
  const abortRef   = useRef<AbortController | null>(null);

  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const ctrlXTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ctrlCTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const defModel = getDefaultModel();

  const [done,     setDone]     = useState<ChatMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [hist,     setHist]     = useState<string[]>(loadHistory);
  const [histIdx,  setHistIdx]  = useState(-1);
  const [busy,     setBusy]     = useState(false);
  const [tokens,   setTokens]   = useState(0);
  const [costUsd,  setCostUsd]  = useState(0);
  const [model,    setModel]    = useState(defModel);

  const provider = MODELS.find(m => m.id === model)?.provider ?? detectProvider();
  const [plan,     setPlan]     = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showHistSearch, setShowHistSearch] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sessionList, setSessionList] = useState<SessionEntry[]>([]);
  const [vimMode, setVimMode] = useState(false);
  const [showScroll, setShowScroll] = useState(false);
  const [fileMatches, setFileMatches] = useState<string[]>([]);
  const [atQuery, setAtQuery] = useState('');
  const [keysInitProv, setKeysInitProv] = useState<string | undefined>();
  const openKeysAfterModelRef = useRef<string | undefined>(undefined);
  const [submitKey, setSubmitKey] = useState(0);
  const [isEditingPaste, setIsEditingPaste] = useState(false);

  const [taskQueue, setTaskQueue] = useState<TaskQueue | null>(null);
  const [queueStatus, setQueueStatus] = useState({ pending: 0, running: false });
  const processTaskRef = useRef<(task: QueuedTask) => Promise<void>>(async () => {});

  const agentCounterRef = useRef(0);
  const activeToolsRef  = useRef<ActiveTurn[]>([]);
  const [activeTurnsTools, setActiveTurnsTools] = useState<ActiveTurn[]>([]);

  const taskStartedAtRef = useRef<number>(0);
  const [taskStartedAt, setTaskStartedAt] = useState<number>(0);

  type TimelineEntry =
    | { kind: 'text'; text: string }
    | { kind: 'thinking'; text: string }
    | {
        kind: 'tool';
        name: string;
        label: string;
        arg: string;
        startedAt: number;
        done: boolean;
        diff?: any;
        diffStats?: { added: number; removed: number };
        path?: string;
      };
  const timelineRef = useRef<TimelineEntry[]>([]);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const textFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const AGENT_TYPE_LABELS: Record<string, string> = {
    explore: 'Explorer', plan: 'Planner', verify: 'Verifier',
    code: 'Coder', research: 'Researcher', custom: 'Custom',
  };

  useEffect(() => {
    const queue = initTaskQueue(
      async (task: QueuedTask) => { await processTaskRef.current(task); },
      (tasks, current) => {
        setQueueStatus({
          pending: tasks.filter(t => t.status === 'pending').length,
          running: !!(current?.status === 'running'),
        });
      }
    );
    setTaskQueue(queue);
  }, []);

  useEffect(() => {
    try {
      if (busy) process.stdout.write('\x1b]0;⏺ dirgha · working\x07');
      else process.stdout.write('\x1b]0;dirgha\x07');
    } catch { /* ok */ }
  }, [busy]);

  // TUI-aware ReplStream: slash commands that call ctx.print / ctx.stream.*
  // MUST push into the message list. Writing to process.stdout fights Ink's
  // render loop and the output becomes invisible — that's why /help and other
  // slash menu commands appeared to "do nothing".
  const pushSlashOutput = useCallback((text: string) => {
    if (!text) return;
    push({ role: 'system', content: text.replace(/\s+$/, '') });
  }, []);

  useEffect(() => {
    ctxRef.current = {
      messages: llmHistory.current, model, totalTokens: tokens,
      toolCallCount: 0, sessionId: sessionId.current,
      isPlanMode: plan, isYolo: false, modelTier: 'auto',
      todos: [], permissionLevel: 'WorkspaceWrite', activeTheme: 'default',
      stream: {
        markdown: pushSlashOutput,
        write: pushSlashOutput,
      },
      print: pushSlashOutput,
      cwd: process.cwd(),
    };
  });

  function push(msg: Omit<ChatMsg, 'id' | 'ts'>) {
    setDone(d => [...d, { ...msg, id: uid(), ts: Date.now() }]);
  }

  useEffect(() => {
    buildSystemPrompt().catch(() => {});
    push({ role: 'system', content: LOGO, isLogo: true });

    if (resumeSessionId) {
      const session = loadDBSession(resumeSessionId);
      if (session && session.messages.length > 0) {
        llmHistory.current = session.messages;
        setModel(session.model || defModel);
        setTokens(session.tokensUsed || 0);
        push({ role: 'system', content: `  ↺  Resumed session (${session.messages.length} msgs)`, isDim: true });
      }
    }

    if (!isConfigured()) {
      setShowKeys(true);
    } else {
      push({ role: 'system', content: `  ◈  ${modelLabel(defModel)}  ·  /model to switch`, isDim: true });
    }
    
    if (initialPrompt) {
      setTimeout(() => submit(initialPrompt), 100);
    }

    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      if (ctrlXTimeoutRef.current) clearTimeout(ctrlXTimeoutRef.current);
      if (ctrlCTimeoutRef.current) clearTimeout(ctrlCTimeoutRef.current);
    };
  }, []);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (busy) {
        if (taskQueue) taskQueue.cancelAll();
        else abortRef.current?.abort();
        return;
      }
      if (input) { setInput(''); return; }
      if (ctrlCArmed.current) { exit(); return; }
      ctrlCArmed.current = true;
      ctrlCTimeoutRef.current = setTimeout(() => { ctrlCArmed.current = false; }, 2000);
      push({ role: 'system', content: '  ⚠  Press Ctrl+C again to exit', isDim: true });
      return;
    }
    if (key.escape) {
      if (busy) {
        if (taskQueue) taskQueue.cancelAll();
        else abortRef.current?.abort();
      } else if (input) { setInput(''); }
      return;
    }
    if (showPicker || showKeys || showHistSearch || showSessions || showScroll) return;
    if (kb('scrollUp', ch, key)) { if (done.length > 0) setShowScroll(true); return; }
    if (kb('historySearch', ch, key)) { setShowHistSearch(true); return; }
    if (key.upArrow) {
      const nextIdx = Math.min(histIdx + 1, hist.length - 1);
      if (nextIdx >= 0) { setHistIdx(nextIdx); setInput(hist[hist.length - 1 - nextIdx] ?? ''); }
      return;
    }
    if (key.downArrow) {
      const nextIdx = histIdx - 1;
      setHistIdx(Math.max(-1, nextIdx));
      setInput(nextIdx < 0 ? '' : hist[hist.length - 1 - nextIdx] ?? '');
      return;
    }
  });

  useEffect(() => {
    if (!input || showPicker || showKeys || showHistSearch || showSessions || showScroll) {
      setFileMatches([]); setAtQuery(''); return;
    }
    const atMatch = input.match(/@([\w./\-]*)$/);
    if (atMatch) {
      const q = atMatch[1] ?? '';
      setAtQuery(q);
      const timer = setTimeout(async () => {
        try {
          const { globSync } = await import('glob');
          const pattern = q ? `**/*${q}*` : '**/*';
          const files = (globSync(pattern, { cwd: process.cwd(), nodir: true, ignore: ['node_modules/**', '.git/**', 'dist/**'] }) as string[]).slice(0, 10);
          setFileMatches(files);
        } catch { setFileMatches([]); }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setFileMatches([]); setAtQuery('');
    }
  }, [input, showPicker, showKeys, showHistSearch, showSessions, showScroll]);

  const processTask = async (task: QueuedTask): Promise<void> => {
    const prompt = task.prompt;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setBusy(true);
    timelineRef.current = []; setLiveTimeline([]);
    taskStartedAtRef.current = Date.now(); setTaskStartedAt(taskStartedAtRef.current);
    setHist(h => [...h.filter(x => x !== trimmed), trimmed]);
    setHistIdx(-1);
    saveHistory(trimmed);
    trackProject(sessionId.current, trimmed);

    try {
      if (trimmed.startsWith('!')) {
        const cmd = trimmed.slice(1).trim();
        if (cmd) {
          push({ role: 'user', content: trimmed });
          const { spawn } = await import('child_process');
          const proc = spawn('/bin/sh', ['-c', cmd], { shell: false });
          let combined = '';
          proc.stdout.on('data', (d) => { combined += d.toString(); });
          proc.stderr.on('data', (d) => { combined += d.toString(); });
          await new Promise((resolve) => {
            const timer = setTimeout(() => { proc.kill('SIGTERM'); combined += '\n[timed out after 30s]'; resolve(null); }, 30000);
            proc.on('close', () => { clearTimeout(timer); resolve(null); });
          });
          push({ role: 'system', content: combined.trim() || '(no output)' });
        }
        return;
      }

      if (trimmed.startsWith('/')) {
        const ctx = ctxRef.current!;
        await handleSlash(trimmed, ctx);
        setPlan(ctx.isPlanMode);
        if (ctx.model) setModel(ctx.model);
        return;
      }

      const { runAgentLoop } = await import('../agent/loop.js');
      // Accumulate the full streamed text so we can persist it as the final
      // assistant message. Without this the user sees the text stream live,
      // then the timeline gets wiped and only "(done)" remains — the answer
      // is gone by the time they scroll up.
      let finalStreamedText = '';
      const onText = (chunk: string) => {
        finalStreamedText += chunk;
        const tl = timelineRef.current;
        const last = tl[tl.length - 1];
        if (last?.kind === 'text') last.text += chunk;
        else tl.push({ kind: 'text', text: chunk });
        if (textFlushRef.current) clearTimeout(textFlushRef.current);
        textFlushRef.current = setTimeout(() => setLiveTimeline([...timelineRef.current]), 60);
      };
      
      const result = await runAgentLoop(
        prompt,
        llmHistory.current,
        resolveModel(classifyQuery(trimmed, llmHistory.current), model),
        onText,
        (name, input) => {
          const tl = timelineRef.current;
          tl.push({ kind: 'tool', name, label: name, arg: JSON.stringify(input), startedAt: Date.now(), done: false });
          setLiveTimeline([...tl]);
        },
        ctxRef.current ?? undefined,
        undefined,
        { signal: task.abortController?.signal },
        undefined,
        // onToolResult: attach diff + path to the matching timeline entry so
        // DiffView renders the full-line green/red block once the edit lands.
        (_toolUseId, name, toolResult) => {
          const tl = timelineRef.current;
          // Find the most recent non-done tool entry for this tool name.
          for (let i = tl.length - 1; i >= 0; i--) {
            const e: any = tl[i];
            if (e?.kind === 'tool' && e.name === name && !e.done) {
              e.done = true;
              if (toolResult.diff) e.diff = toolResult.diff;
              if (toolResult.diffStats) e.diffStats = toolResult.diffStats;
              if ((toolResult as any).path) e.path = (toolResult as any).path;
              break;
            }
          }
          setLiveTimeline([...tl]);
        }
      );
      
      // Mark all as done for stable final render before busy=false
      timelineRef.current.forEach((e: any) => { e.done = true; });
      setLiveTimeline([...timelineRef.current]);

      llmHistory.current = result.messages;
      // Persist the streamed answer as the assistant message so users see
      // their reply after the live timeline gets wiped. Fall back to the
      // last text block in result.messages if streaming yielded nothing
      // (some providers return the full response non-streaming).
      let finalText = finalStreamedText.trim();
      if (!finalText) {
        const last = result.messages[result.messages.length - 1];
        if (last?.role === 'assistant') {
          finalText = typeof last.content === 'string'
            ? last.content
            : Array.isArray(last.content)
              ? (last.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('').trim()
              : '';
        }
      }
      push({
        role: 'assistant',
        content: finalText || '(no output)',
        tokens: result.tokensUsed,
      });
      setTokens(t => t + result.tokensUsed);
      setCostUsd(c => c + (result.costUsd ?? 0));
    } catch (err: any) {
      push({ role: 'system', content: `✗ ${err.message}` });
    } finally {
      setBusy(false);
      timelineRef.current = []; setLiveTimeline([]);
    }
  };

  processTaskRef.current = processTask;

  const submit = useCallback((prompt: string) => {
    let trimmed = prompt.trim();
    if (!trimmed) return;

    // Auto-complete partial slash commands — "/hel" → "/help", "/sta" → "/status".
    if (trimmed.startsWith('/')) {
      const completed = autoCompleteSlash(trimmed);
      if (completed) trimmed = completed;
    }

    setInput('');

    // UI-mutating slash commands need direct React state access; they can't
    // round-trip through handleSlash since that runs outside the component.
    if (trimmed === '/model') { setShowPicker(true); return; }
    if (trimmed === '/keys')  { setShowKeys(true); return; }
    if (trimmed === '/scroll' || trimmed === '/history') {
      if (done.length > 0) setShowScroll(true);
      return;
    }

    // Mid-work injection: when the agent is already running and the user
    // submits non-slash text, push it into the pending-user-messages queue
    // so it gets picked up at the next LLM turn boundary (typically <2s).
    // This is processing, not queueing — the model sees it on the very next
    // turn and can change course. Slash commands always go through the task
    // queue so they don't mutate an in-flight agent session.
    const isSlash = trimmed.startsWith('/');
    if (busy && !isSlash) {
      import('../agent/pending-messages.js').then(m => m.pushPendingUserMessage(trimmed));
      push({ role: 'user', content: trimmed });
      push({ role: 'system', content: '  ⚡  injected — will hit the next model turn', isDim: true });
      return;
    }

    if (taskQueue) taskQueue.enqueue(trimmed);
  }, [taskQueue, done, busy]);

  return (
    <Box flexDirection="column">
      {showScroll && <ScrollView messages={done} onClose={() => setShowScroll(false)} />}
      {/* Static keeps the last N messages visible above the InputBox.
          Cap at 20 (was 50) so a busy session doesn't push the prompt off
          the bottom of a typical 40-row terminal. Users can `/scroll`
          (Ctrl+R) to see older messages. */}
      {!showScroll && <Static items={done.slice(-20)}>{msg => <CompletedMsg key={msg.id} msg={msg} />}</Static>}
      {!showScroll && busy && (
        <>
          <ActivitySummary busy={busy} timeline={liveTimeline} taskStartedAt={taskStartedAt} />
          <LiveView timeline={liveTimeline} busy={busy} />
        </>
      )}
      {!showScroll && (showKeys ? (
        <KeysPicker onClose={() => setShowKeys(false)} />
      ) : showPicker ? (
        <ModelPicker current={model} onSelect={setModel} onClose={() => setShowPicker(false)} />
      ) : showHistSearch ? (
        <HistorySearch history={hist} onSelect={setInput} onCancel={() => setShowHistSearch(false)} />
      ) : showSessions ? (
        <SessionPicker sessions={sessionList} onSelect={id => { /* resume logic */ }} onCancel={() => setShowSessions(false)} />
      ) : (
        <>
          {fileMatches.length > 0 && <FileComplete query={atQuery} matches={fileMatches} onSelect={f => setInput(input.replace(/@[\w./\-]*$/, `@${f}`))} onCancel={() => setFileMatches([])} />}
          <InputBox
            value={input}
            onChange={setInput}
            onSubmit={submit}
            busy={busy} plan={plan} model={model} provider={provider}
            focus={!showPicker && !showKeys && !showHistSearch}
            submitKey={submitKey}
            placeholder={busy ? 'type to inject · Esc to cancel' : ''}
            costUsd={costUsd}
          />
        </>
      ))}
      <StatusBar model={model} tokens={tokens} plan={plan} busy={busy} costUsd={costUsd} />
    </Box>
  );
}
