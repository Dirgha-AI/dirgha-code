import * as React from 'react';
import os from 'os';
import type { Message, ReplContext } from '../types.js';
import { loadHistory, saveHistory, uid } from './helpers.js';
import { ChatMsg } from './constants.js';
import { getDefaultModel } from '../agent/gateway.js';

function makeDefaultCtx(sessionId: string): ReplContext {
  const noop = () => {};
  return {
    messages: [],
    model: getDefaultModel(),
    totalTokens: 0,
    toolCallCount: 0,
    sessionId,
    isPlanMode: false,
    isYolo: false,
    modelTier: 'auto',
    todos: [],
    permissionLevel: 'WorkspaceWrite',
    activeTheme: 'default' as any,
    stream: { markdown: noop, raw: noop, json: noop } as any,
    print: noop,
    cwd: process.cwd() || os.homedir(),
  };
}

/**
 * useAppSession — Hook for history, message management, and REPL state.
 * Implements the Static Append Strategy.
 */
export function useAppSession() {
  const sessionId = React.useRef(uid());
  const llmHistory = React.useRef<Message[]>([]);
  const ctxRef = React.useRef<ReplContext>(makeDefaultCtx(sessionId.current));
  
  const [done, setDone] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState('');
  const [hist, setHist] = React.useState<string[]>(loadHistory);
  const [histIdx, setHistIdx] = React.useState(-1);
  const [tokens, setTokens] = React.useState(0);
  const [costUsd, setCostUsd] = React.useState(0);

  const pushToDone = React.useCallback((msg: Omit<ChatMsg, 'id' | 'ts'>) => {
    setDone(d => [...d, { ...msg, id: uid(), ts: Date.now() }]);
  }, []);

  const updateSession = React.useCallback((newInput: string) => {
    setHist(h => [...h.filter(x => x !== newInput), newInput]);
    setHistIdx(-1);
    saveHistory(newInput);
  }, []);

  return { 
    sessionId, llmHistory, ctxRef,
    done, pushToDone, setDone,
    input, setInput,
    hist, setHist,
    histIdx, setHistIdx,
    tokens, setTokens,
    costUsd, setCostUsd,
    updateSession
  };
}
