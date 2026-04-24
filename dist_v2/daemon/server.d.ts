/**
 * Daemon server. Reads JSON-RPC messages from stdin, dispatches to
 * method handlers, writes responses + event notifications to stdout.
 * The stream id returned by prompt.submit correlates notifications for
 * the client.
 */
import type { ProviderRegistry } from '../providers/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { SessionStore } from '../context/session.js';
import type { DirghaConfig } from '../cli/config.js';
export interface DaemonServerOptions {
    registry: ToolRegistry;
    providers: ProviderRegistry;
    sessions: SessionStore;
    config: DirghaConfig;
    cwd: string;
}
export declare class DaemonServer {
    private opts;
    private active;
    private started;
    private totalUsage;
    constructor(opts: DaemonServerOptions);
    start(): void;
    private handle;
    private healthResult;
    private sessionStart;
    private sessionResume;
    private sessionList;
    private sessionMessages;
    private promptSubmit;
    private writeResult;
    private writeError;
    private writeNotification;
}
