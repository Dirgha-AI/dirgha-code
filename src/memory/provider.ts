/**
 * memory/provider.ts — Abstract interface for memory providers
 *
 * Interface: initialize → prefetch → syncTurn → end.
 * Providers expose tool schemas the model can call (memory_store, memory_recall, etc.)
 * and inject static text into the system prompt.
 */

export interface MemoryProviderOpts {
  homeDir: string;
  platform: string;
}

export interface MemoryProvider {
  /** Human-readable name (e.g. 'holographic', 'builtin') */
  readonly name: string;

  /** Called once at session start */
  initialize(sessionId: string, opts: MemoryProviderOpts): Promise<void>;

  /** Static text injected into system prompt (e.g. memory dump) */
  systemPromptBlock(): string;

  /** Pre-fetch relevant memories before a turn */
  prefetch(query: string): Promise<string>;

  /** Save context from a completed turn (best-effort) */
  syncTurn(userMsg: string, assistantMsg: string): Promise<void>;

  /** Tool schemas this provider exposes to the model */
  getToolSchemas(): any[];

  /** Handle a tool call from the model; return string result */
  handleToolCall(name: string, input: Record<string, any>): Promise<string>;

  /** Called at session end for cleanup / flush */
  onSessionEnd(): Promise<void>;
}
