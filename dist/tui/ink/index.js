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
import { App, VERSION } from "./App.js";
import { renderLogoString } from "./components/Logo.js";
import { minFlushMs } from "./is-small-terminal.js";
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
    const restore = () => {
        if (useAltBuffer) {
            process.stdout.write("\x1b[?1049l");
        }
    };
    const sessionHandle = { session: null };
    // Register alt-buffer restore + session flush on the synchronous `exit`
    // event so the terminal is always left in a usable state regardless of
    // how the process terminates (SIGINT via main.ts's mcpShutdownOnSignal,
    // SIGTERM, uncaught exception, or normal exit). Writing the escape
    // sequence twice is harmless — `restore()` is idempotent.
    //
    // We do NOT register our own SIGINT/SIGTERM `process.once` handlers here:
    // main.ts already owns signal dispatch. Registering a second `once` for
    // the same signal would cause the second handler to fire on the *next*
    // signal (after the first listener was consumed), producing confusing
    // double-exit behaviour. The `exit` listener below is sufficient.
    const onProcessExit = () => {
        restore();
        const s = sessionHandle.session;
        if (s) {
            try {
                s.close();
            }
            catch {
                /* best-effort */
            }
        }
    };
    process.on("exit", onProcessExit);
    // Debounce resize events so phone rotation doesn't trigger immediate full
    // repaints. The shim is installed just before render() and restored in the
    // finally block below.
    const _origEmit = process.stdout.emit.bind(process.stdout);
    let _resizeDebounce = null;
    process.stdout.emit = (event, ...args) => {
        if (event === "resize") {
            if (_resizeDebounce)
                clearTimeout(_resizeDebounce);
            _resizeDebounce = setTimeout(() => {
                _resizeDebounce = null;
                _origEmit("resize", ...args);
            }, minFlushMs());
            return true;
        }
        return _origEmit(event, ...args);
    };
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
        // Remove the exit listener — normal teardown through waitUntilExit
        // handles cleanup here; we don't need the safety-net to fire too.
        process.removeListener("exit", onProcessExit);
        // Restore the original stdout.emit (undo resize debounce shim).
        if (_resizeDebounce)
            clearTimeout(_resizeDebounce);
        process.stdout.emit = _origEmit;
        restore();
    }
}
//# sourceMappingURL=index.js.map