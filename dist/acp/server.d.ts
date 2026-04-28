/**
 * ACP (Agent Client Protocol) adapter.
 *
 * Thin bridge between the ACP wire format and the daemon protocol. ACP
 * lets IDEs embed dirgha as their agent backend with a reduced, stable
 * method surface. Implements the minimum viable methods: initialize,
 * newSession, prompt, and cancel. Runs over stdio JSON-RPC.
 */
import type { ProviderRegistry } from '../providers/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { SessionStore } from '../context/session.js';
import type { DirghaConfig } from '../cli/config.js';
export interface AcpServerOptions {
    registry: ToolRegistry;
    providers: ProviderRegistry;
    sessions: SessionStore;
    config: DirghaConfig;
    cwd: string;
}
export declare class AcpServer {
    private opts;
    private sessionsByAcpId;
    private usage;
    constructor(opts: AcpServerOptions);
    start(): void;
    private handle;
    private handlePrompt;
    private reply;
    private replyError;
    private notify;
}
