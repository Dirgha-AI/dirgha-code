/**
 * tui/App.tsx — Root DirghaApp component with NON-BLOCKING input
 *
 * KEY FEATURE: Task Queue System
 * - You can type and submit prompts while tools are running
 * - New prompts are queued and processed after current task finishes
 * - Shows queue status: "2 tasks queued" 
 * - Press Enter to queue, ESC to cancel current
 *
 * Other fixes:
 *   - Logo pushed as ONE Static item (was 9 — caused scroll jitter)
 *   - Static always mounted — picker overlays instead of replacing render tree
 *   - Model picker: no per-row borderStyle (caused layout shift on cursor move)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import type { Message, ReplContext } from '../types.js';
import { consoleStream } from '../types.js';
// Clean streaming architecture (NO pulsating boxes, NO double showcase)
import { StreamContainer } from './components/stream/index.js';
import type { StreamEvent } from './components/stream/index.js';
import { detectProvider, getDefaultModel } from '../agent/gateway.js';
import { runAgentLoop, buildSystemPrompt } from '../agent/loop.js';
import { resolveModel, classifyQuery } from '../agent/routing.js';
import { handleSlash, autoCompleteSlash } from '../repl/slash/index.js';
import { syncSession } from '../sync/session.js';
import { isProjectInitialized } from '../utils/config.js';
import { isLoggedIn, isConfigured } from '../utils/credentials.js';
import { SPIN, LOGO, MODELS, type ChatMsg } from './constants.js';
import { C } from './colors.js';
import { uid, renderMd, modelLabel, provLabel, MarkdownBuffer, loadHistory, saveHistory, openInEditor, formatTokens } from './helpers.js';
import { kb, kbLabel } from './keybindings.js';
import { trackProject } from '../utils/project-tracker.js';
import { readState, writeState } from '../utils/state.js';
import { loadDBSession, saveDBSession } from '../session/persistence.js';
import { logger } from '../utils/logger.js';
import { StatusBar } from './components/StatusBar.js';
import { FleetPanel } from './components/FleetPanel.js';
import { HelpOverlay } from './components/HelpOverlay.js';
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
import type { ActiveTurn } from './tui-types.js';

export function DirghaApp({ initialPrompt, resumeSessionId, maxBudgetUsd }: { initialPrompt?: string; resumeSessionId?: string; maxBudgetUsd?: number }) {
  const { exit } = useApp();
  const sessionId  = useRef(uid());
  const ctxRef     = useRef<ReplContext | null>(null);
  const llmHistory = useRef<Message[]>([]);
  const ctrlXArmed = useRef(false);
  const abortRef   = useRef<AbortController | null>(null);
  
  // Timeout refs for cleanup - prevents orphaned timers on unmount
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const ctrlXTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const defModel = getDefaultModel();

  const [done,     setDone]     = useState<ChatMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [hist,     setHist]     = useState<string[]>(loadHistory);
  const [histIdx,  setHistIdx]  = useState(-1);
  const [busy,     setBusy]     = useState(false);
  const [spin,     setSpin]     = useState(0);
  const [tokens,   setTokens]   = useState(0);  const [costUsd,  setCostUsd]  = useState(0);
  const [model,    setModel]    = useState(defModel);

  // Derive provider from the currently selected model — updates when model changes via picker
  const provider = MODELS.find(m => m.id === model)?.provider ?? detectProvider();
  const [plan,     setPlan]     = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showHistSearch, setShowHistSearch] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sessionList, setSessionList] = useState<SessionEntry[]>([]);
  const [vimMode, setVimMode] = useState(false);
  const [showScroll, setShowScroll] = useState(false);
  const [fileMatches, setFileMatches] = useState<string[]>([]);
  const [atQuery, setAtQuery] = useState('');
  const [keysInitProv, setKeysInitProv] = useState<string | undefined>();
  const openKeysAfterModelRef = useRef<string | undefined>(undefined);
  const [submitKey, setSubmitKey] = useState(0);
  const [isEditingPaste, setIsEditingPaste] = useState(false);

  // TASK QUEUE STATE (NEW: Non-blocking input)
  const [taskQueue, setTaskQueue] = useState<TaskQueue | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [currentTask, setCurrentTask] = useState<QueuedTask | null>(null);
  const [queueStatus, setQueueStatus] = useState({ pending: 0, running: false });
  // Ref so the TaskQueue callback always calls the LATEST processTask (avoids
  // stale closure: useEffect runs once, but processTask re-creates on each
  // render when model/state changes — without the ref the queue would forever
  // use the mount-time model).
  const processTaskRef = useRef<(task: QueuedTask) => Promise<void>>(async () => {});

  // Active-turn tool/agent tracking — kept for CompletedMsg tool-group
  const agentCounterRef = useRef(0);
  const activeToolsRef  = useRef<ActiveTurn[]>([]);
  const [activeTurnsTools, setActiveTurnsTools] = useState<ActiveTurn[]>([]);

  // Clean stream events (NO pulsating boxes, NO double showcase)
  const streamEventsRef = useRef<StreamEvent[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const taskStartedAtRef = useRef<number>(0);
  const [taskStartedAt, setTaskStartedAt] = useState<number>(0);
  const textFlushRef = useRef<NodeJS.Timeout | null>(null);
  const thinkFlushRef = useRef<NodeJS.Timeout | null>(null);

  const AGENT_TYPE_LABELS: Record<string, string> = {
    explore: 'Explorer', plan: 'Planner', verify: 'Verifier',
    code: 'Coder', research: 'Researcher', custom: 'Custom',
  };

  // Initialize task queue on mount
  useEffect(() => {
    const queue = initTaskQueue(
      async (task: QueuedTask) => {
        await processTaskRef.current(task);
      },
      (tasks, current) => {
        setQueuedTasks(tasks);
        setCurrentTask(current);
        setQueueStatus({
          pending: tasks.filter(t => t.status === 'pending').length,
          running: !!(current?.status === 'running'),
        });
      }
    );
    setTaskQueue(queue);
  }, []);

  // spin no longer drives any animation — StatusBar has its own elapsed timer

  // Terminal title: show activity indicator while working
  useEffect(() => {
    try {
      if (busy) {
        process.stdout.write('\x1b]0;⏺ dirgha · working\x07');
      } else {
        process.stdout.write('\x1b]0;dirgha\x07');
      }
    } catch { /* non-TTY environment */ }
  }, [busy]);

  useEffect(() => {
    ctxRef.current = {
      messages: llmHistory.current, model, totalTokens: tokens,
      toolCallCount: 0, sessionId: sessionId.current,
      isPlanMode: plan, isYolo: false, modelTier: 'auto',
      todos: [], permissionLevel: 'WorkspaceWrite', activeTheme: 'default',
      stream: consoleStream,
      print: (txt: string) => ctxRef.current?.stream.markdown(txt),
      cwd: process.cwd(),
    };
  });

  function push(msg: Omit<ChatMsg, 'id' | 'ts'>) {
    setDone(d => [...d, { ...msg, id: uid(), ts: Date.now() }]);
  }

  useEffect(() => {
    buildSystemPrompt().catch(err => {
      logger.error('Failed to build system prompt', { error: err instanceof Error ? err.message : String(err) });
    });
    push({ role: 'system', content: LOGO, isLogo: true });

    const resumeId = resumeSessionId;
    if (resumeId) {
      const session = loadDBSession(resumeId);
      if (session && session.messages.length > 0) {
        llmHistory.current = session.messages;
        setModel(session.model || defModel);
        setTokens(session.tokensUsed || 0);
        { const t = session.title.replace(/\s*\(\d+ msgs?\)\s*$/, '').trim();
          push({ role: 'system', content: `  ↺  Resumed: ${t} (${session.messages.length} msgs)`, isDim: true }); }
      }
    }

    // Startup CTA banner (option A minimal, option B first-run invitational)
    // — see src/tui/startup-cta.ts for the state machine.
    import('./startup-cta.js').then(({ buildStartupCta }) => {
      const cta = buildStartupCta({ model: defModel });
      for (const line of cta.lines) {
        push({ role: 'system', content: line, isDim: true });
      }
      // On genuine first-run with no config, still open the keys picker as before
      if (cta.invitational && !isConfigured()) {
        const t = setTimeout(() => setShowKeys(true), 600);
        timeoutsRef.current.push(t);
      } else if (isLoggedIn() && isProjectInitialized()) {
        // nothing extra to say
      } else if (isConfigured() && !isProjectInitialized()) {
        push({ role: 'system', content: '  ○  New project — run /init to scan this directory', isDim: true });
      }
    }).catch(() => {
      // Fallback to the old one-liner if startup-cta fails
      push({ role: 'system', content: `  ∎  ${modelLabel(defModel)} · ${provLabel(provider)} · ready`, isDim: true });
    });
    
    // Track initial prompt timeout for cleanup
    let initialPromptTimeout: NodeJS.Timeout | null = null;
    if (initialPrompt) {
      initialPromptTimeout = setTimeout(() => submit(initialPrompt), 100);
      timeoutsRef.current.push(initialPromptTimeout);
    }
    
    // Cleanup all timeouts on unmount
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current = [];
      if (ctrlXTimeoutRef.current) {
        clearTimeout(ctrlXTimeoutRef.current);
        ctrlXTimeoutRef.current = null;
      }
    };
  }, []);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') { exit(); return; }
    // Escape while busy = cancel current run AND clear entire queue.
    // Escape while idle = clear the input field (standard REPL convention).
    if (key.escape) {
      if (busy) {
        if (taskQueue) taskQueue.cancelAll();
        else abortRef.current?.abort();
        // Clear streaming display immediately so user doesn't see stale tool boxes
        streamEventsRef.current = [];
        setStreamEvents([]);
      } else if (input) {
        setInput('');
        setHistIdx(-1);
        setIsEditingPaste(false);
      }
      return;
    }
    if (showPicker) return;
    if (showKeys) return;
    if (showHistSearch) return;
    if (showSessions) return;
    if (showScroll) return;
    if (kb('scrollUp', ch, key)) {
      if (done.length > 0) setShowScroll(true);
      return;
    }
    if (kb('historySearch', ch, key)) { setShowHistSearch(true); return; }
    if (kb('sessionPicker', ch, key)) {
      import('../session/db.js').then(({ getDB }) => {
        const db = getDB();
        const rows = db.prepare(
          `SELECT id, title, model, tokens, updated_at as updatedAt
           FROM sessions ORDER BY updated_at DESC LIMIT 20`
        ).all() as SessionEntry[];
        setSessionList(rows);
        setShowSessions(true);
      }).catch(err => {
        logger.error('Failed to load sessions', { error: err instanceof Error ? err.message : String(err) });
        push({ role: 'system', content: '  ⚠  Failed to load sessions', isDim: true });
      });
      return;
    }
    if (key.ctrl && ch === 'x') {
      ctrlXArmed.current = true;
      // Clear any existing timeout to prevent multiple disarms
      if (ctrlXTimeoutRef.current) clearTimeout(ctrlXTimeoutRef.current);
      ctrlXTimeoutRef.current = setTimeout(() => { 
        ctrlXArmed.current = false; 
        ctrlXTimeoutRef.current = null;
      }, 2000);
      return;
    }
    if (ctrlXArmed.current && (ch === 'e' || (key.ctrl && ch === 'e'))) {
      ctrlXArmed.current = false;
      const edited = openInEditor(input);
      if (edited !== input) setInput(edited);
      return;
    }
    if (key.ctrl && ch === 'e' && !ctrlXArmed.current) {
      setIsEditingPaste(prev => !prev);
      return;
    }
    if (key.ctrl && ch === 'k') {
      setInput('');
      setIsEditingPaste(false);
      return;
    }
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

  function expandAtRefs(prompt: string): string {
    return prompt.replace(/@([\w./\-]+)/g, (_m, filePath: string) => {
      try {
        const abs = filePath.startsWith('/') ? filePath : path.resolve(process.cwd(), filePath);
        const content = fs.readFileSync(abs, 'utf8');
        const lines = content.split('\n').length;
        return `\n<file path="${abs}" lines="${lines}">\n${content}\n</file>`;
      } catch { return `@${filePath}`; }
    });
  }

  /**
   * Process a task (called by TaskQueue).
   */
  const processTask = async (task: QueuedTask): Promise<void> => {
    const prompt = task.prompt;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setBusy(true);
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
          // shell:false — pass through /bin/sh explicitly to preserve pipes/redirects
          // while avoiding shell injection from agent-generated commands
          const out = spawnSync('/bin/sh', ['-c', cmd], { shell: false, encoding: 'utf8', timeout: 30000 });
          const result = (out.stdout || out.stderr || '(no output)').trim();
          push({ role: 'system', content: result });
        }
        return;
      }

      if (trimmed.startsWith('/')) {
        const ctx = ctxRef.current!;
        try {
          // Capture console.log output from slash command handlers
          const lines: string[] = [];
          const origLog = console.log;
          const origError = console.error;
          console.log = (...args: any[]) =>
            lines.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
          console.error = (...args: any[]) =>
            lines.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
          await handleSlash(trimmed, ctx);
          console.log = origLog;
          console.error = origError;
          if (lines.length > 0) push({ role: 'system', content: lines.join('\n') });
          setPlan(ctx.isPlanMode);
          if (ctx.model) setModel(ctx.model);
          setVimMode(process.env['DIRGHA_VIM'] === '1');
        } catch (e) {
          push({ role: 'system', content: `✗ ${(e as Error).message}` });
        }
        return;
      }

      if (maxBudgetUsd && costUsd >= maxBudgetUsd) {
        push({ role: 'system', content: `  ⛔  Budget cap reached ($${costUsd.toFixed(4)} / $${maxBudgetUsd}). Use /clear to reset costs.` });
        return;
      }

      const expanded = expandAtRefs(trimmed);
      let accumulated = '';
      let accumulatedThinking = '';
      const mdBuf = new MarkdownBuffer();
      agentCounterRef.current = 0;
      activeToolsRef.current = [];
      setActiveTurnsTools([]);

      // Per-iteration text: starts fresh after each tool block so that when
      // the agent loop re-emits preamble text on the next iteration we don't
      // render "I'll research... Let me... Let me..." as one growing line.
      // `accumulated` still collects the full final text for push/save.
      // Newline-gated streaming with hysteresis:
      //   - If chunk contains '\n' → commit immediately (complete line arrived)
      //   - Else debounce to 60ms (catch-up for long lines / slow models)
      //   - Long-running no-newline: force flush after 200ms max stall
      const onText = (chunk: string) => {
        accumulated += chunk; mdBuf.push(chunk);
        const evs = streamEventsRef.current;
        evs.push({ type: 'text', content: chunk });
        if (textFlushRef.current) clearTimeout(textFlushRef.current);
        if (chunk.includes('\n')) {
          setStreamEvents([...streamEventsRef.current]);
        } else {
          textFlushRef.current = setTimeout(
            () => setStreamEvents([...streamEventsRef.current]),
            60,
          );
        }
      };
      const onThinking = (chunk: string) => {
        accumulatedThinking += chunk;
        const evs = streamEventsRef.current;
        evs.push({ type: 'thought', content: chunk });
        if (thinkFlushRef.current) clearTimeout(thinkFlushRef.current);
        thinkFlushRef.current = setTimeout(() => setStreamEvents([...streamEventsRef.current]), 60);
      };
      const toolIdMap = new Map<string, string>(); // name → event id (for matching onToolResult)
      const onTool = (name: string, toolInput: Record<string, unknown>): string => {
        const tid = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let label: string;
        let entry: typeof activeToolsRef.current[number];

        if (name === 'spawn_agent') {
          const n = ++agentCounterRef.current;
          const agentType = (toolInput as any)?.type ?? 'custom';
          label = `Agent ${n}: ${AGENT_TYPE_LABELS[agentType] ?? agentType}`;
          entry = { name, label, agentNum: n, input: toolInput, startedAt: Date.now() };
        } else {
          label = name;
          entry = { name, label, input: toolInput, startedAt: Date.now() };
        }
        activeToolsRef.current = [...activeToolsRef.current, entry];
        setActiveTurnsTools(activeToolsRef.current);

        toolIdMap.set(name, tid); // last invocation of this tool name
        const arg = String(Object.values(toolInput)[0] ?? '');
        const evs = streamEventsRef.current;
        evs.push({
          type: 'tool_start',
          tool: { id: tid, name, label, arg, startedAt: Date.now(), status: 'running' },
        });
        setStreamEvents([...evs]);
        return tid;
      };

      const onToolResult = (_toolUseId: string, name: string, resultText: string, isError: boolean) => {
        const tid = toolIdMap.get(name);
        if (!tid) return;
        toolIdMap.delete(name);
        const evs = streamEventsRef.current;
        evs.push({ type: 'tool_end', toolId: tid, result: resultText.slice(0, 120), isError });
        setStreamEvents([...evs]);
      };

      const effective = resolveModel(classifyQuery(trimmed, llmHistory.current), model);
      const result = await runAgentLoop(
        expanded,
        llmHistory.current,
        effective,
        onText,
        onTool,
        ctxRef.current ?? undefined,
        undefined,
        { signal: task.abortController?.signal },
        onThinking,
        onToolResult,
      );
      
      llmHistory.current = result.messages;
      const finalContent = (accumulated || '(no response)').replace(/<think>[\s\S]*?<\/think>/g, '').trim() || '(no response)';
      const rendered = renderMd(finalContent);
      if (activeToolsRef.current.length > 0) {
        push({
          role: 'tool-group',
          content: '',
          tools: activeToolsRef.current.map(t => ({ name: t.name, label: t.label })),
        });
      }
      push({
        role: 'assistant', 
        content: finalContent, 
        rendered, 
        thinking: accumulatedThinking || undefined,
        tokens: result.tokensUsed, 
        model: effective 
      });
      setTokens(t => t + result.tokensUsed);
      syncSession(llmHistory.current, model, tokens + result.tokensUsed, result.costUsd).catch(err => {
        logger.error('Failed to sync session', { error: err instanceof Error ? err.message : String(err) });
      });
      setCostUsd(c => c + (result.costUsd ?? 0));
      const autoCtx = ctxRef.current!;
      saveDBSession({ ...autoCtx, messages: llmHistory.current, totalTokens: tokens + result.tokensUsed }).catch(err => {
        logger.error('Failed to save session', { error: err instanceof Error ? err.message : String(err) });
      });
      writeState({ lastSessionId: sessionId.current, lastModel: effective });
      } catch (err: any) {
      if (err.name === 'AbortError' || task.status === 'cancelled') {
        push({ role: 'system', content: '  ⏹  Task cancelled', isDim: true });
      } else {
        push({ role: 'assistant', content: `✗ ${(err as Error).message}` });
      }
    } finally {
      activeToolsRef.current = [];
      setActiveTurnsTools([]);
      streamEventsRef.current = []; setStreamEvents([]);
      if (thinkFlushRef.current) { clearTimeout(thinkFlushRef.current); thinkFlushRef.current = null; }
      if (textFlushRef.current) { clearTimeout(textFlushRef.current); textFlushRef.current = null; }
      setBusy(false);
    }
  };

  // Keep ref in sync with the latest processTask closure on every render.
  // The TaskQueue callback (created once at mount) reads this ref so it always
  // dispatches to the current model/state, not the mount-time snapshot.
  processTaskRef.current = processTask;

  /**
   * Submit handler - NOW NON-BLOCKING!
   * Adds to queue instead of waiting
   */
  const submit = useCallback((prompt: string) => {
    let trimmed = prompt.trim();
    if (!trimmed) return;

    // Auto-complete partial slash commands on Enter
    // e.g., "/hel" → "/help", "/sta" → "/status"
    if (trimmed.startsWith('/')) {
      const completed = autoCompleteSlash(trimmed);
      if (completed) {
        trimmed = completed;
        // Show what was auto-completed
        push({ role: 'system', content: `  →  Auto-completed: ${trimmed}`, isDim: true });
      }
    }

    setInput('');
    setFileMatches([]); setAtQuery('');
    setIsEditingPaste(false);
    setSubmitKey(k => k + 1);

    // /model with no args → open picker immediately, don't queue
    if (trimmed === '/model') { setShowPicker(true); return; }
    // /help → open modal overlay instead of printing to chat
    if (trimmed === '/help') { setShowHelp(true); return; }

    // Echo user message immediately for regular chat prompts (not slash/shell)
    if (!trimmed.startsWith('/') && !trimmed.startsWith('!')) {
      push({ role: 'user', content: trimmed });
    }

    // Add to task queue instead of processing immediately
    if (taskQueue) {
      const isStop = trimmed === '/stop';
      taskQueue.enqueue(trimmed, { priority: isStop ? 10 : 0 });
    } else {
      // Fallback: process immediately if queue not ready (legacy/startup)
      // Note: we need to wrap it in a mock task object for the new processTask signature
      processTask({
        id: 'direct',
        prompt: trimmed,
        status: 'running',
        submittedAt: Date.now(),
        priority: 0
      } as any);
    }
  }, [taskQueue]);

  return (
    <Box flexDirection="column">
      {showScroll && (
        <ScrollView
          messages={done}
          onClose={() => setShowScroll(false)}
        />
      )}

      {!showScroll && <Static items={done.slice(-50)}>{msg => <CompletedMsg key={msg.id} msg={msg} />}</Static>}

      {!showScroll && busy && !showPicker && (
        <StreamContainer events={streamEvents} isStreaming={busy} />
      )}

      {!showScroll && <FleetPanel />}


      {/* Queue Status Indicator — only when something is running AND more tasks are waiting */}
      {!showScroll && queueStatus.pending > 0 && queueStatus.running && (
        <Box paddingX={2}>
          <Text color={C.accent}>⏳ {queueStatus.pending} queued · ESC to skip</Text>
        </Box>
      )}

      {!showScroll && (showHelp ? (
        <HelpOverlay onClose={() => setShowHelp(false)} />
      ) : showKeys ? (
        <KeysPicker
          initialProvider={keysInitProv}
          onKeySaved={(provId: string) => {
            // Only show quick-start guide on genuine first-time setup
            if (!isConfigured()) return;
            push({ role: 'system', content: `  ∎  ${provId} key saved — you're ready`, isDim: true });
            push({ role: 'system', content: [
              '  Quick start:',
              '  · /verify      — check your setup',
              '  · /init        — scan this project',
              '  · /model kimi  — switch model',
              '  · /help        — all 50+ commands',
              '  · Just type to start →',
            ].join('\n'), isDim: true });
          }}
          onClose={() => { setShowKeys(false); setInput(''); setKeysInitProv(undefined); }}
        />
      ) : showPicker ? (
        <ModelPicker
          current={model}
          onSelect={(id: string) => {
            setModel(id);
            process.env['DIRGHA_CODE_MODEL'] = id;
            const provKeyMap: Record<string, string> = {
              fireworks: 'FIREWORKS_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
              openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
              openrouter: 'OPENROUTER_API_KEY', nvidia: 'NVIDIA_API_KEY',
            };
            const meta = MODELS.find(m => m.id === id);
            if (meta) {
              const envKey = provKeyMap[meta.provider];
              if (envKey && !process.env[envKey]) {
                openKeysAfterModelRef.current = meta.provider;
              }
            }
          }}
          onClose={() => {
            setShowPicker(false);
            setInput('');
            if (openKeysAfterModelRef.current) {
              setKeysInitProv(openKeysAfterModelRef.current);
              openKeysAfterModelRef.current = undefined;
              setShowKeys(true);
            }
          }}
        />
      ) : showHistSearch ? (
        <HistorySearch
          history={hist}
          onSelect={entry => { setShowHistSearch(false); setInput(entry); }}
          onCancel={() => setShowHistSearch(false)}
        />
      ) : showSessions ? (
        <SessionPicker
          sessions={sessionList}
          onSelect={id => {
            setShowSessions(false);
            const session = loadDBSession(id);
            if (session && session.messages.length > 0) {
              llmHistory.current = session.messages;
              setModel(session.model || defModel);
              setTokens(session.tokensUsed || 0);
              { const t = session.title.replace(/\s*\(\d+ msgs?\)\s*$/, '').trim();
                push({ role: 'system', content: `  ↺  Resumed: ${t} (${session.messages.length} msgs)`, isDim: true }); }
            }
          }}
          onCancel={() => setShowSessions(false)}
        />
      ) : (
        <>
          {fileMatches.length > 0 && (
            <FileComplete
              query={atQuery}
              matches={fileMatches}
              onSelect={filePath => {
                const newInput = input.replace(new RegExp(`@${atQuery}\\b?`), `@${filePath}`);
                setInput(newInput);
                setFileMatches([]);
                setAtQuery('');
              }}
              onCancel={() => { setFileMatches([]); setAtQuery(''); }}
            />
          )}
          <SlashHint input={input} />
          <InputBox
            value={input}
            onChange={async v => {
              const lineCount = v.split('\n').length;
              const charCount = v.length;
              const isLargePaste = lineCount > 5 || charCount > 500;

              if (isLargePaste) {
                setInput(v);
                setFileMatches([]); setAtQuery('');
                return;
              }

              setInput(v);
              const atMatch = v.match(/@([\w./\-]*)$/);
              if (atMatch) {
                const q = atMatch[1] ?? '';
                setAtQuery(q);
                try {
                  const { globSync } = await import('glob');
                  const pattern = q ? `**/*${q}*` : '**/*';
                  const files = (globSync(pattern, { cwd: process.cwd(), nodir: true, ignore: ['node_modules/**', '.git/**', 'dist/**'] }) as string[]).slice(0, 10);
                  setFileMatches(files);
                } catch { setFileMatches([]); }
              } else {
                setFileMatches([]);
                setAtQuery('');
              }
            }}
            onSubmit={v => {
              // NON-BLOCKING: Always allow submit, queue the task
              if (fileMatches.length > 0) {
                const top = fileMatches[0]!;
                setInput(v.replace(new RegExp(`@${atQuery}\\b?`), `@${top}`));
                setFileMatches([]); setAtQuery('');
                return;
              }
              submit(v);
            }}
            busy={busy}
            plan={plan}
            model={model}
            provider={provider}
            focus={!showPicker && !showKeys && !showHistSearch && !showHelp}
            submitKey={submitKey}
            costUsd={costUsd}
            isEditingPaste={isEditingPaste}
            onToggleEditPaste={() => setIsEditingPaste(p => !p)}
            // NEW: Always enabled, shows queue status
            placeholder={queueStatus.pending > 0 
              ? `Queue: ${queueStatus.pending} pending · Type to add more...` 
              : (busy ? 'Running... Type to queue next task' : 'ask anything · /help · @file · !shell')}
          />
        </>
      ))}

      <StatusBar
        model={model}
        tokens={tokens}
        plan={plan}
        busy={busy}
        costUsd={costUsd}
        vimMode={vimMode}
        scrollMode={showScroll}
        safeMode={process.getuid?.() !== 0}
        queueStatus={queueStatus.pending > 0 ? `${queueStatus.pending} queued` : undefined}
        phase={streamEvents.some(e => e.type === 'tool_start') ? 'acting' : streamEvents.some(e => e.type === 'text') ? 'writing' : 'thinking'}
        parallelCount={activeTurnsTools.length}
      />
  </Box>
  );
}
