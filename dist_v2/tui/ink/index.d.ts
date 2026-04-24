/**
 * Public entry point for the Ink TUI.
 *
 * `runInkTUI(config)` mounts the Ink root and returns a promise that
 * resolves when the user exits. Shape mirrors `runInteractive()` in
 * ../../cli/interactive.ts so the CLI can swap renderers by flag.
 */
import type { Message } from '../../kernel/types.js';
import type { ProviderRegistry } from '../../providers/index.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { SessionStore } from '../../context/session.js';
import type { DirghaConfig } from '../../cli/config.js';
export { App } from './App.js';
export { Logo } from './components/Logo.js';
export { StatusBar } from './components/StatusBar.js';
export { StreamingText } from './components/StreamingText.js';
export { ToolBox } from './components/ToolBox.js';
export { ThinkingBlock } from './components/ThinkingBlock.js';
export { InputBox } from './components/InputBox.js';
export interface RunInkTUIOptions {
    registry: ToolRegistry;
    providers: ProviderRegistry;
    sessions: SessionStore;
    config: DirghaConfig;
    cwd: string;
    systemPrompt?: string;
    initialMessages?: Message[];
}
export declare function runInkTUI(opts: RunInkTUIOptions): Promise<void>;
