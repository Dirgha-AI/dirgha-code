/**
 * Interactive REPL. A thin readline loop that routes user input either
 * to the agent loop (regular prompts) or to the slash registry
 * (commands starting with /). Streaming output is rendered via the TUI
 * renderer subscribed to the shared event stream.
 */
import type { Message } from '../kernel/types.js';
import type { ProviderRegistry } from '../providers/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { SessionStore } from '../context/session.js';
import type { DirghaConfig } from './config.js';
export interface InteractiveOptions {
    registry: ToolRegistry;
    providers: ProviderRegistry;
    sessions: SessionStore;
    config: DirghaConfig;
    cwd: string;
    systemPrompt?: string;
    initialMessages?: Message[];
}
export declare function runInteractive(opts: InteractiveOptions): Promise<void>;
