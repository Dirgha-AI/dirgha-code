/**
 * Headless browser tool.
 *
 * Subcommands: goto, click, screenshot, content, close.
 *
 * Keeps a single Chromium instance + page alive across calls within the
 * process so subsequent actions land on the same DOM. The shell owns the
 * lifecycle: call the exported `closeBrowser()` at shutdown to release
 * the child process and delete the tmp user-data-dir.
 *
 * Playwright is loaded lazily so the module's import graph stays light:
 * if the runtime binary isn't installed, callers get a structured error
 * from `execute()` rather than a crash at import time. The `playwright`
 * package is resolvable in this workspace via pnpm — see the v1 browser
 * tool for the older `agent-browser` shell-out implementation this tool
 * supersedes.
 */
import type { Tool } from './registry.js';
/**
 * Shut down the browser instance and reset module state. Safe to call
 * repeatedly; a no-op when no browser is running. The shell should call
 * this from its exit handler so headless Chromium doesn't leak across
 * process lifetimes.
 */
export declare function closeBrowser(): Promise<void>;
export declare const browserTool: Tool;
export default browserTool;
