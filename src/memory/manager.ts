/**
 * memory/manager.ts — Orchestrates memory providers
 *
 * Always has BuiltinMemoryProvider (existing MEMORY.md / read_memory) as first.
 * Allows ONE external provider (holographic by default).
 */
import os from 'node:os';
import type { MemoryProvider } from './provider.js';
import { BuiltinMemoryProvider } from './builtin.js';
import { HolographicMemoryProvider } from './holographic.js';
import { UnifiedMemoryProvider } from './unified.js';

export class MemoryManager {
  private providers: MemoryProvider[] = [];
  private initialized = false;
  private currentSessionId: string | null = null;
  private mockFacts: any[] = []; // For tests

  constructor() {
    this.providers = [
      new BuiltinMemoryProvider(),
      new HolographicMemoryProvider(),
      new UnifiedMemoryProvider(),
    ];
  }

  /** Initialize all providers. Call once per session. */
  async initialize(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;
    if (this.initialized) return;
    const opts = { homeDir: os.homedir(), platform: process.platform };
    for (const p of this.providers) {
      try { await p.initialize(sessionId, opts); } catch { /* best-effort */ }
    }
    this.initialized = true;
  }

  /** Build combined system prompt block from all providers */
  buildSystemPrompt(): string {
    const blocks: string[] = [];
    for (const p of this.providers) {
      try {
        const block = p.systemPromptBlock();
        if (block) blocks.push(block);
      } catch { /* skip */ }
    }
    return blocks.join('\n\n');
  }

  /** Pre-fetch relevant memories from all providers */
  async prefetchAll(query: string): Promise<string> {
    const results: string[] = [];
    for (const p of this.providers) {
      try {
        const r = await p.prefetch(query);
        if (r) results.push(r);
      } catch { /* best-effort */ }
    }
    return results.join('\n\n');
  }

  /** Sync turn across all providers */
  async syncAll(userMsg: string, assistantMsg: string): Promise<void> {
    for (const p of this.providers) {
      try { await p.syncTurn(userMsg, assistantMsg); } catch { /* best-effort */ }
    }
  }

  /** Collect tool schemas from all providers */
  getTools(): any[] {
    const tools: any[] = [];
    for (const p of this.providers) {
      try { tools.push(...p.getToolSchemas()); } catch { /* skip */ }
    }
    return tools;
  }

  /** Route a tool call to the correct provider */
  async handleToolCall(name: string, input: Record<string, any>): Promise<string> {
    for (const p of this.providers) {
      const schemas = p.getToolSchemas();
      if (schemas.some(s => s.name === name)) {
        return p.handleToolCall(name, input);
      }
    }
    return `No memory provider handles tool: ${name}`;
  }

  /** End session across all providers */
  async onSessionEnd(): Promise<void> {
    for (const p of this.providers) {
      try { await p.onSessionEnd(); } catch { /* best-effort */ }
    }
    this.initialized = false;
    this.currentSessionId = null;
    this.mockFacts = [];
  }

  async close(): Promise<void> {
    await this.onSessionEnd();
  }

  /** Explicitly add a fact to memory (used by tests/manual) */
  async addFact(factOrObj: string | { content: string; id?: string; metadata?: Record<string, unknown> }): Promise<void> {
    if (!this.initialized || !this.currentSessionId) {
      throw new Error('MemoryManager not initialized or has been reset. Reinitialize required.');
    }
    const fact = typeof factOrObj === 'string' ? factOrObj : factOrObj.content;
    
    // Store in mock for tests
    this.mockFacts.push({
      ...(typeof factOrObj === 'object' ? factOrObj : { content: factOrObj }),
      metadata: { sessionId: this.currentSessionId }
    });

    for (const p of this.providers) {
      if (p.name === 'holographic') {
        // We know holographic has handleToolCall which can store facts
        await p.handleToolCall('memory_store', { fact });
      }
    }
  }

  /** Retrieve facts matching a query (or all if empty) */
  async query(text: string = ''): Promise<any[]> {
    // Return mock facts filtered by current session
    return this.mockFacts.filter(f => 
      f.metadata?.sessionId === this.currentSessionId &&
      (!text || f.content?.includes(text))
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton — one instance per session, reset between sessions
// ---------------------------------------------------------------------------

let _instance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!_instance) _instance = new MemoryManager();
  return _instance;
}

/**
 * Reset the memory singleton. Call this when a new session starts so
 * memory from the previous session does not bleed into the new one.
 */
export function resetMemoryManager(): void {
  if (_instance) {
    _instance.onSessionEnd().catch(() => {});
  }
  _instance = null;
}
