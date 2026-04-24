/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */
export interface Transport {
    send(message: unknown): Promise<void>;
    onMessage(handler: (message: unknown) => void): void;
    close(): Promise<void>;
}
export interface StdioTransportOptions {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
}
export declare class StdioTransport implements Transport {
    private opts;
    private child;
    private handlers;
    private buffer;
    private ready;
    constructor(opts: StdioTransportOptions);
    private start;
    private onData;
    send(message: unknown): Promise<void>;
    onMessage(handler: (message: unknown) => void): void;
    close(): Promise<void>;
}
