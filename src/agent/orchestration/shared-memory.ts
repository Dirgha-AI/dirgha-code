/**
 * agent/orchestration/shared-memory.ts — Namespaced shared memory for multi-agent coordination
 * Pattern from open-multi-agent: each agent writes under its own namespace,
 * any agent can read any entry. Prevents namespace collisions while enabling
 * transparent data flow between agents.
 */

interface MemoryEntry {
  agentName: string;
  key: string;
  value: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class SharedMemory {
  private store = new Map<string, MemoryEntry>();

  /** Write under agent's namespace: stored as `agentName/key` */
  write(agentName: string, key: string, value: unknown, metadata?: Record<string, unknown>): void {
    const fqKey = `${agentName}/${key}`;
    this.store.set(fqKey, { agentName, key, fqKey, value, timestamp: Date.now(), metadata } as any);
  }

  /** Read by fully-qualified key (`agentName/key`) or bare key */
  read(key: string): unknown {
    return this.store.get(key)?.value;
  }

  /** List all entries across all agents */
  listAll(): MemoryEntry[] {
    return [...this.store.values()];
  }

  /** Filter entries by agent */
  listByAgent(agentName: string): MemoryEntry[] {
    return this.listAll().filter(e => e.agentName === agentName);
  }

  /** Generate markdown summary for system prompt injection */
  getSummary(maxValueLen = 200): string {
    if (this.store.size === 0) return '';
    const byAgent = new Map<string, MemoryEntry[]>();
    for (const entry of this.store.values()) {
      if (!byAgent.has(entry.agentName)) byAgent.set(entry.agentName, []);
      byAgent.get(entry.agentName)!.push(entry);
    }
    const lines: string[] = ['## Agent Shared Memory'];
    for (const [agent, entries] of byAgent) {
      lines.push(`\n### ${agent}`);
      for (const e of entries) {
        const val = JSON.stringify(e.value);
        lines.push(`- **${e.key}**: ${val.length > maxValueLen ? val.slice(0, maxValueLen) + '...' : val}`);
      }
    }
    return lines.join('\n');
  }

  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}

/** Global singleton shared across agents in a session */
let _globalMemory: SharedMemory | null = null;
export function getSharedMemory(): SharedMemory {
  if (!_globalMemory) _globalMemory = new SharedMemory();
  return _globalMemory;
}
export function resetSharedMemory(): void { _globalMemory = null; }
