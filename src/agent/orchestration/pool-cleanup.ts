/**
 * agent/orchestration/pool-cleanup.ts — Idle agent cleanup
 */
import type { AgentId } from './types.js';
import type { AgentConfig } from '../spawn/types.js';

interface PoolEntry {
  agent: AgentConfig;
  status: 'idle' | 'active' | 'stopping';
  acquiredAt?: Date;
  lastActivity: Date;
  taskCount: number;
}

let interval: NodeJS.Timeout | undefined;

export function startIdleChecks(
  agents: Map<AgentId, PoolEntry>,
  idleTimeoutMs: number,
  removeFn: (id: AgentId) => Promise<void>
): void {
  interval = setInterval(() => {
    cleanupIdleAgents(agents, idleTimeoutMs, removeFn);
  }, 60000);
}

export function stopIdleChecks(): void {
  if (interval) clearInterval(interval);
}

export async function cleanupIdleAgents(
  agents: Map<AgentId, PoolEntry>,
  idleTimeoutMs: number,
  removeFn: (id: AgentId) => Promise<void>
): Promise<void> {
  const now = Date.now();
  const toRemove: AgentId[] = [];
  
  for (const [id, entry] of agents) {
    if (entry.status === 'idle' && now - entry.lastActivity.getTime() > idleTimeoutMs) {
      toRemove.push(id);
    }
  }
  
  await Promise.all(toRemove.map(id => removeFn(id)));
}
