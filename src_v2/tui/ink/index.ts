/**
 * Public entry point for the Ink TUI.
 *
 * `runInkTUI(config)` mounts the Ink root and returns a promise that
 * resolves when the user exits. Shape mirrors `runInteractive()` in
 * ../../cli/interactive.ts so the CLI can swap renderers by flag.
 */

import * as React from 'react';
import { render } from 'ink';
import type { Message } from '../../kernel/types.js';
import { createEventStream } from '../../kernel/event-stream.js';
import type { ProviderRegistry } from '../../providers/index.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { SessionStore } from '../../context/session.js';
import type { DirghaConfig } from '../../cli/config.js';
import { App } from './App.js';
import { createDefaultSlashRegistry, registerBuiltinSlashCommands } from '../../cli/slash.js';

export { App } from './App.js';
export { Logo } from './components/Logo.js';
export { StatusBar } from './components/StatusBar.js';
export { StreamingText } from './components/StreamingText.js';
export { ToolBox } from './components/ToolBox.js';
export { ThinkingBlock } from './components/ThinkingBlock.js';
export { InputBox } from './components/InputBox.js';
export { ModelPicker, type ModelEntry } from './components/ModelPicker.js';
export { HelpOverlay, type HelpSlashCommand } from './components/HelpOverlay.js';
export { AtFileComplete } from './components/AtFileComplete.js';
export { PasteCollapseView, detectPaste } from './components/PasteCollapse.js';
export { applyVimKey, createVimState, type VimMode, type VimState } from './components/vim-bindings.js';

import type { HelpSlashCommand, ModelEntry } from './index.js';

export interface RunInkTUIOptions {
  registry: ToolRegistry;
  providers: ProviderRegistry;
  sessions: SessionStore;
  config: DirghaConfig;
  cwd: string;
  systemPrompt?: string;
  initialMessages?: Message[];
  /** Slash command list forwarded to the help overlay. */
  slashCommands?: HelpSlashCommand[];
  /** Model catalogue forwarded to the model picker. */
  models?: ModelEntry[];
}

export async function runInkTUI(opts: RunInkTUIOptions): Promise<void> {
  const events = createEventStream();
  const slashRegistry = createDefaultSlashRegistry();
  await registerBuiltinSlashCommands(slashRegistry);
  const element = React.createElement(App, {
    events,
    registry: opts.registry,
    providers: opts.providers,
    sessions: opts.sessions,
    config: opts.config,
    cwd: opts.cwd,
    slashRegistry,
    ...(opts.systemPrompt !== undefined ? { systemPrompt: opts.systemPrompt } : {}),
    ...(opts.slashCommands !== undefined ? { slashCommands: opts.slashCommands } : {}),
    ...(opts.models !== undefined ? { models: opts.models } : {}),
  });
  const instance = render(element, {
    exitOnCtrlC: false,
  });
  try {
    await instance.waitUntilExit();
  } finally {
    events.close();
  }
}
