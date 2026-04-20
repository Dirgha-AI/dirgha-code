import * as React from 'react';
import { spawnSync } from 'child_process';
import { runAgentLoop } from '../agent/loop.js';
import { resolveModel, classifyQuery } from '../agent/routing.js';
import { handleSlash } from '../repl/slash/index.js';
import { renderMd } from './helpers.js';
import { writeState } from '../utils/state.js';
import { optimizeContext } from '../agent/context-optimizer.js';
import type { QueuedTask } from './TaskQueue.js';

export function useAppProcessor(session: any, stream: any, model: string, plan: boolean) {
  const [busyCount, setBusyCount] = React.useState(0);

  const processTask = React.useCallback(async (task: QueuedTask) => {
    const prompt = task.prompt.trim();
    if (!prompt) return;
    
    setBusyCount(prev => prev + 1);
    session.updateSession(prompt);

    try {
      if (prompt.startsWith('!')) {
        const out = spawnSync('/bin/sh', ['-c', prompt.slice(1).trim()], { shell: false, encoding: 'utf8', timeout: 30000 });
        session.pushToDone({ role: 'system', content: (out.stdout || out.stderr || '(no output)').trim() });
        return;
      }
      
      if (prompt.startsWith('/')) {
        await handleSlash(prompt, session.ctxRef.current);
        return;
      }

      session.pushToDone({ role: 'user', content: prompt });

      // Keep ctx in sync with current model + history before each call
      session.ctxRef.current.model = model;
      session.ctxRef.current.messages = session.llmHistory.current;

      const optimizedHistory = optimizeContext(session.llmHistory.current);
      const effective = resolveModel(classifyQuery(prompt, optimizedHistory), model);
      const result = await runAgentLoop(prompt, optimizedHistory, effective,
        (t) => stream.pushEvent({ type: 'text', content: t, id: task.id }),
        (n, i) => {
          const tid = `t-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          stream.pushEvent({ type: 'tool_start', id: task.id, tool: { id: tid, name: n, label: n, arg: JSON.stringify(i), startedAt: Date.now(), status: 'running' } });
          return tid;
        },
        session.ctxRef.current, undefined, { signal: task.abortController?.signal },
        (th) => stream.pushEvent({ type: 'thought', content: th, id: task.id }),
        (tid, n, r, e) => stream.pushEvent({ type: 'tool_end', id: task.id, toolId: tid, result: r, isError: e })
      );

      session.llmHistory.current = result.messages;
      const last = result.messages[result.messages.length - 1];
      const final = (typeof last?.content === 'string' ? last.content : '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      session.pushToDone({ role: 'assistant', content: final, rendered: renderMd(final), tokens: result.tokensUsed, model: effective });
      
      session.setTokens((t: number) => t + result.tokensUsed);
      session.setCostUsd((c: number) => c + (result.costUsd ?? 0));
      writeState({ lastSessionId: session.sessionId.current, lastModel: effective });
    } catch (err: any) {
      // AbortError = user pressed Esc, not a real failure
      if (err?.name === 'AbortError' || err?.message === 'Aborted') return;
      session.pushToDone({ role: 'assistant', content: `✗ ${err.message}` });
    } finally {
      setBusyCount(prev => {
        const next = Math.max(0, prev - 1);
        if (next === 0) stream.clearEvents();
        return next;
      });
    }
  }, [session, stream, model, plan]);

  return { processTask, busy: busyCount > 0 };
}
