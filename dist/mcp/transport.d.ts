/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */
export interface Transport {
    send(message: unknown): Promise<void>;
    onMessage(handler: (message: unknown) => void): void;
    /** Subscribe to transport-level close (server crash, pipe broken, etc.). */
    onClose?(handler: () => void): void;
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
    private closeHandlers;
    private buffer;
    private ready;
    constructor(opts: StdioTransportOptions);
    private start;
    private onData;
    send(message: unknown): Promise<void>;
    onMessage(handler: (message: unknown) => void): void;
    onClose(handler: () => void): void;
    close(): Promise<void>;
}
export interface HttpTransportOptions {
    /** MCP server endpoint, e.g. https://mcp.example.com/v1 */
    url: string;
    /** Static bearer token / API key. Mutually exclusive with `bearerProvider`. */
    bearerToken?: string;
    /**
     * Async bearer-token provider. Called before every request so OAuth
     * tokens can refresh without recreating the transport. Cache the
     * token inside the callback and only re-mint on expiry.
     */
    bearerProvider?: () => Promise<string | undefined> | string | undefined;
    /** Extra headers (Origin, X-Project, etc.). */
    headers?: Record<string, string>;
    /** Per-request timeout in ms. Default 60s. */
    timeoutMs?: number;
}
/**
 * HTTP transport for remote MCP servers using the streamable-HTTP
 * variant (POST per request, response is `text/event-stream` SSE).
 *
 * The send() method:
 *   - posts the JSON-RPC envelope to `${url}/messages` (or just `url`)
 *   - reads the response body as SSE; every `data:` line that parses
 *     to JSON is fanned out to handlers (notifications + the
 *     correlated response come through the same channel).
 *
 * Notifications (server-initiated `tools/list_changed`, etc.) arrive
 * on the response stream of the most recent client request, which is
 * the canonical pattern for streamable-HTTP MCP — no separate WS
 * connection.
 */
export declare class HttpTransport implements Transport {
    private opts;
    private handlers;
    private closed;
    constructor(opts: HttpTransportOptions);
    send(message: unknown): Promise<void>;
    onMessage(handler: (message: unknown) => void): void;
    close(): Promise<void>;
}
