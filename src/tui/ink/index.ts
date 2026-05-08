/**
 * Public entry point for the Ink TUI.
 *
 * `runInkTUI(config)` mounts the Ink root and returns a promise that
 * resolves when the user exits. Shape mirrors `runInteractive()` in
 * ../../cli/interactive.ts so the CLI can swap renderers by flag.
 */

import * as React from "react";
import { render } from "ink";
import type { Message } from "../../kernel/types.js";
import { createEventStream } from "../../kernel/event-stream.js";
import type { ProviderRegistry } from "../../providers/index.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { SessionStore, Session } from "../../context/session.js";
import type { DirghaConfig } from "../../cli/config.js";
import { closeSession } from "../../state/index.js";
import { App, VERSION } from "./App.js";
import { renderLogoString } from "./components/Logo.js";
import {
  createDefaultSlashRegistry,
  registerBuiltinSlashCommands,
} from "../../cli/slash.js";

export { App } from "./App.js";
export { Logo } from "./components/Logo.js";
export { StatusBar } from "./components/StatusBar.js";
export { StreamingText } from "./components/StreamingText.js";
export { ToolBox } from "./components/ToolBox.js";
export { ThinkingBlock } from "./components/ThinkingBlock.js";
export { InputBox } from "./components/InputBox.js";
export { ModelPicker, type ModelEntry } from "./components/ModelPicker.js";
export {
  HelpOverlay,
  type HelpSlashCommand,
} from "./components/HelpOverlay.js";
export { AtFileComplete } from "./components/AtFileComplete.js";
export { PasteCollapseView, detectPaste } from "./components/PasteCollapse.js";
export {
  applyVimKey,
  createVimState,
  type VimMode,
  type VimState,
} from "./components/vim-bindings.js";

import type { HelpSlashCommand, ModelEntry } from "./index.js";

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
  ledgerContext?: string;
  /** Mutable ref — App writes the active session here so runInkTUI can flush on exit. */
  sessionHandle?: { session: Session | null };
}

export async function runInkTUI(opts: RunInkTUIOptions): Promise<void> {
  const events = createEventStream();
  const slashRegistry = createDefaultSlashRegistry();
  await registerBuiltinSlashCommands(slashRegistry);

  const useAltBuffer = opts.config.alternateBuffer !== false;

  if (useAltBuffer) {
    process.stdout.write("\x1b[?1049h");
  }

  // Emit the brand logo to stdout BEFORE Ink mounts. Keeping the logo
  // out of Ink's render tree avoids the re-emission flicker users hit
  // when transcripts overflow the viewport: Ink's onRender prepends
  // `fullStaticOutput` (which would include the logo if it lived in
  // `<Static>`) on every overflow redraw — see
  // node_modules/ink/build/ink.js:118-125. The logo now sits in
  // terminal scrollback (or alt buffer scrollback) and Ink never
  // touches it.
  if (process.stdout.isTTY) {
    const cols = process.stdout.columns ?? 80;
    process.stdout.write(renderLogoString(opts.config.theme, VERSION, cols));
    // OSC 0: set both window title and icon name. Updated to include
    // the session title once the model emits one (see App.tsx).
    process.stdout.write("\x1b]0;Dirgha\x07");
  }

  const restore = (): void => {
    if (useAltBuffer) {
      process.stdout.write("\x1b[?1049l");
    }
  };

  const doExit = (): void => {
    const s = opts.sessionHandle?.session;
    if (s) {
      try {
        s.close();
        void closeSession(s.id);
      } catch {
        /* best-effort */
      }
    }
    restore();
    process.exit(s ? 0 : 1);
  };

  process.once("SIGINT", () => {
    doExit();
  });
  process.once("SIGTERM", () => {
    doExit();
  });

  const sessionHandle: { session: Session | null } = { session: null };

  const element = React.createElement(App, {
    events,
    registry: opts.registry,
    providers: opts.providers,
    sessions: opts.sessions,
    config: opts.config,
    cwd: opts.cwd,
    slashRegistry,
    sessionHandle,
    ...(opts.systemPrompt !== undefined
      ? { systemPrompt: opts.systemPrompt }
      : {}),
    ...(opts.slashCommands !== undefined
      ? { slashCommands: opts.slashCommands }
      : {}),
    ...(opts.models !== undefined ? { models: opts.models } : {}),
    ...(opts.ledgerContext !== undefined
      ? { ledgerContext: opts.ledgerContext }
      : {}),
  });
  const instance = render(element, {
    exitOnCtrlC: false,
  });
  try {
    await instance.waitUntilExit();
  } finally {
    events.close();
    restore();
  }
}
