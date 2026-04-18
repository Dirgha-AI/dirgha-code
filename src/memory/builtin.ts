/**
 * memory/builtin.ts — Wraps existing session/memory.ts as a MemoryProvider
 *
 * This provider surfaces the existing save_memory / read_memory data
 * into the plugin system without changing how those tools work.
 */
import type { MemoryProvider, MemoryProviderOpts } from './provider.js';

export class BuiltinMemoryProvider implements MemoryProvider {
  readonly name = 'builtin';

  async initialize(_sessionId: string, _opts: MemoryProviderOpts): Promise<void> {
    // No-op — DB is lazily initialized by session/db.ts
  }

  systemPromptBlock(): string {
    try {
      // Dynamic import would be async; use require for sync access (matches db.ts pattern)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readMemory } = require('../session/memory.js') as typeof import('../session/memory.js');
      const mem = readMemory();
      if (mem) return `## Persistent Memory (from previous sessions)\n${mem}`;
    } catch { /* DB not available */ }
    return '';
  }

  async prefetch(query: string): Promise<string> {
    try {
      const { searchMemory } = await import('../session/memory.js');
      const results = searchMemory(query, 5);
      if (results.length) {
        return results.map(r => `[${r.key}] ${r.content}`).join('\n');
      }
    } catch { /* best-effort */ }
    return '';
  }

  async syncTurn(_userMsg: string, _assistantMsg: string): Promise<void> {
    // No-op — builtin memory is explicit via save_memory / read_memory tools
  }

  getToolSchemas(): any[] {
    // Existing save_memory / read_memory tools stay in tools.ts — no duplication
    return [];
  }

  async handleToolCall(_name: string, _input: Record<string, any>): Promise<string> {
    return 'Unknown tool';
  }

  async onSessionEnd(): Promise<void> {
    // No-op
  }
}
