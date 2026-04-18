/**
 * tui/index.ts — Entry point for Ink TUI
 */
import React from 'react';
import { render } from 'ink';
import { DirghaApp } from './App.js';
import { initCronTable } from '../cron/store.js';
import { startCronDaemon, stopCronDaemon } from '../cron/runner.js';
import { getDefaultModel } from '../agent/gateway.js';
import { profiler } from '../utils/startup-profiler.js';
import { consoleStream } from '../types.js';
import { logger } from '../utils/logger.js';

export async function startTUI(initialPrompt?: string, resumeSessionId?: string, maxBudgetUsd?: number): Promise<void> {
  profiler.begin('ink-render');
  const { unmount } = render(
    React.createElement(DirghaApp, { initialPrompt, resumeSessionId, maxBudgetUsd }),
    {
      exitOnCtrlC: true,
      patchConsole: false,
    }
  );

  profiler.end(); // ink-render

  // Start cron daemon — checks for due jobs every 60s
  profiler.begin('cron-init');
  try {
    initCronTable();
    startCronDaemon(getDefaultModel());
  } catch (err) {
    logger.warn('Cron daemon failed to start', { error: err instanceof Error ? err.message : String(err) });
  }
  profiler.end();
  profiler.report();

  // Background: pull wiki git sync on startup (best-effort)
  import('../sync/wiki-git.js').then(({ pullWiki }) => pullWiki()).catch(err => {
    logger.debug('Wiki sync skipped', { error: err instanceof Error ? err.message : String(err) });
  });

  // Background: fetch recent cloud sessions and merge into local DB (cross-device resume)
  import('../sync/session.js').then(async ({ fetchCloudSessions }) => {
    const { saveDBSession } = await import('../session/persistence.js');
    const cloudSessions = await fetchCloudSessions(5);
    for (const s of cloudSessions) {
      if (s.messages && s.messages.length > 0) {
        await saveDBSession({
          sessionId: s.id,
          messages: s.messages,
          model: s.model,
          totalTokens: s.tokensUsed,
          toolCallCount: 0,
          isPlanMode: false,
          isYolo: false,
          modelTier: 'fast' as const,
          activeTheme: 'default' as const,
          permissionLevel: 'Prompt' as const,
          todos: [],
          stream: consoleStream,
          print: (t: string) => consoleStream.markdown(t),
          cwd: process.cwd(),
        }, s.title);
      }
    }
  }).catch(err => {
    // offline-first — never fatal
    logger.debug('Cloud session sync skipped', { error: err instanceof Error ? err.message : String(err) });
  });

  process.on('SIGTERM', () => {
    stopCronDaemon();
    unmount();
    process.exit(0);
  });
}
