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

  constructor() {
    this.providers = [
      new BuiltinMemoryProvider(),
      new HolographicMemoryProvider(),
      new UnifiedMemoryProvider(),
    ];
  }

  /** Initialize all providers. Call once per session. */
  async initialize(sessionId: string): Promise<void> {
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
