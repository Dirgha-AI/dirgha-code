/**
 * agent/orchestration/pool-queue.ts — Queue management for agent pool
 */
import type { AgentId, AgentPoolConfig } from './types.js';
import type { AgentConfig } from '../spawn/types.js';

interface QueueItem {
  agentId?: AgentId;
  resolve: (agent: AgentConfig | null) => void;
  reject: (error: Error) => void;
  priority: number;
  timeout: NodeJS.Timeout;
}

interface PoolEntry {
  agent: AgentConfig;
  status: 'idle' | 'active' | 'stopping';
  acquiredAt?: Date;
  lastActivity: Date;
  taskCount: number;
}

export class PoolQueue {
  private items: QueueItem[] = [];
  private strategy: AgentPoolConfig['queueStrategy'];
  
  constructor(strategy: AgentPoolConfig['queueStrategy']) {
    this.strategy = strategy;
  }
  
  length(): number {
    return this.items.length;
  }
  
  enqueue(
    specificId: AgentId | undefined,
    timeoutMs: number,
    serveFn: () => void,
    agents: Map<AgentId, PoolEntry>
  ): Promise<AgentConfig | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.remove(resolve);
        reject(new Error(`Timeout waiting for agent after ${timeoutMs}ms`));
      }, timeoutMs);
      
      const item: QueueItem = { agentId: specificId, resolve, reject, priority: 1, timeout };
      
      if (this.strategy === 'fifo') {
        this.items.push(item);
      } else {
        const idx = this.items.findIndex(i => i.priority < item.priority);
        idx === -1 ? this.items.push(item) : this.items.splice(idx, 0, item);
      }
    });
  }
  
  serveNext(
    agents: Map<AgentId, PoolEntry>,
    activate: (entry: PoolEntry) => AgentConfig
  ): void {
    if (this.items.length === 0) return;
    
    const idleAgents = Array.from(agents.values()).filter(e => e.status === 'idle');
    
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      
      if (item.agentId) {
        const specific = agents.get(item.agentId);
        if (specific?.status === 'idle') {
          this.items.splice(i, 1);
          clearTimeout(item.timeout);
          item.resolve(activate(specific));
          return;
        }
      } else if (idleAgents.length > 0) {
        this.items.splice(i, 1);
        clearTimeout(item.timeout);
        item.resolve(activate(idleAgents[0]));
        return;
      }
    }
  }
  
  remove(resolve: (agent: AgentConfig | null) => void): void {
    const idx = this.items.findIndex(i => i.resolve === resolve);
    if (idx !== -1) this.items.splice(idx, 1);
  }
  
  rejectAll(error: Error): void {
    for (const item of this.items) {
      clearTimeout(item.timeout);
      item.reject(error);
    }
    this.items = [];
  }
}
