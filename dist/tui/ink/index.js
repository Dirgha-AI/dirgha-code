/**
 * Public entry point for the Ink TUI.
 *
 * `runInkTUI(config)` mounts the Ink root and returns a promise that
 * resolves when the user exits. Shape mirrors `runInteractive()` in
 * ../../cli/interactive.ts so the CLI can swap renderers by flag.
 */
import * as React from "react";
import { render } from "ink";
import { createEventStream } from "../../kernel/event-stream.js";
import { closeSession } from "../../state/index.js";
import { App } from "./App.js";
import { createDefaultSlashRegistry, registerBuiltinSlashCommands, } from "../../cli/slash.js";
export { App } from "./App.js";
export { Logo } from "./components/Logo.js";
export { StatusBar } from "./components/StatusBar.js";
export { StreamingText } from "./components/StreamingText.js";
export { ToolBox } from "./components/ToolBox.js";
export { ThinkingBlock } from "./components/ThinkingBlock.js";
export { InputBox } from "./components/InputBox.js";
export { ModelPicker } from "./components/ModelPicker.js";
export { HelpOverlay, } from "./components/HelpOverlay.js";
export { AtFileComplete } from "./components/AtFileComplete.js";
export { PasteCollapseView, detectPaste } from "./components/PasteCollapse.js";
export { applyVimKey, createVimState, } from "./components/vim-bindings.js";
export async function runInkTUI(opts) {
    const events = createEventStream();
    const slashRegistry = createDefaultSlashRegistry();
    await registerBuiltinSlashCommands(slashRegistry);
    const useAltBuffer = opts.config.alternateBuffer !== false;
    if (useAltBuffer) {
        process.stdout.write("\x1b[?1049h");
    }
    const restore = () => {
        if (useAltBuffer) {
            process.stdout.write("\x1b[?1049l");
        }
    };
    const doExit = () => {
        const s = opts.sessionHandle?.session;
        if (s) {
            try {
                s.close();
                void closeSession(s.id);
            }
            catch {
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
    const sessionHandle = { session: null };
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
    }
    finally {
        events.close();
        restore();
    }
}
//# sourceMappingURL=index.js.map