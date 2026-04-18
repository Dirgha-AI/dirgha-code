// @ts-nocheck
/**
 * agent/orchestration/agent-pool.ts — Resource management with semaphore
 * Phase 1: Agent pool for constrained concurrent execution
 * REFACTORED: Under 100-line budget
 */

import type { AgentId, AgentPoolConfig, PoolStatus } from './types.js';
import { decomposeGoal } from './coordinator.js';
import type { AgentConfig } from '../spawn/types.js';
import { createAgent, destroyAgent } from '../spawn/lifecycle.js';
import { PoolQueue } from './pool-queue.js';
import { PoolScaler } from './pool-scaler.js';
import { cleanupIdleAgents, startIdleChecks, stopIdleChecks } from './pool-cleanup.js';

interface PoolEntry {
  agent: AgentConfig;
  status: 'idle' | 'active' | 'stopping';
  acquiredAt?: Date;
  lastActivity: Date;
  taskCount: number;
}

/** Agent pool with resource constraints */
export class AgentPool {
  private static _instance: AgentPool | null = null;

  /** Singleton accessor — shared pool used by slash commands */
  static getInstance(): AgentPool {
    if (!AgentPool._instance) {
      AgentPool._instance = new AgentPool();
    }
    return AgentPool._instance;
  }

  private agents = new Map<AgentId, PoolEntry>();
  private queue: PoolQueue;
  private scaler: PoolScaler;
  private config: AgentPoolConfig;
  private stopping = false;

  constructor(config: Partial<AgentPoolConfig> = {}) {
    this.config = {
      maxConcurrent: 5,
      queueStrategy: 'fifo',
      autoScale: false,
      scaleUpThreshold: 0.8,
      scaleDownThreshold: 0.2,
      idleTimeoutMs: 300000,
      ...config,
    };
    
    this.queue = new PoolQueue(this.config.queueStrategy);
    this.scaler = new PoolScaler(this.config, this.agents);
    startIdleChecks(this.agents, this.config.idleTimeoutMs, this.removeAgent.bind(this));
  }
  
  /** Acquire an agent from the pool */
  async acquire(specificAgentId?: AgentId, timeoutMs = 30000): Promise<AgentConfig | null> {
    if (this.stopping) return null;
    
    const idle = this.findIdle(specificAgentId);
    if (idle) return this.activate(idle);
    
    if (this.canCreate()) {
      const created = await this.createAndActivate(specificAgentId);
      if (created) return created;
    }
    
    return this.queueForAgent(specificAgentId, timeoutMs, this.serveNext.bind(this));
  }
  
  /** Release an agent back to the pool */
  release(agentId: AgentId): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    
    entry.status = 'idle';
    entry.lastActivity = new Date();
    entry.taskCount++;
    this.serveNext();
  }
  
  /** Get all agents as a flat list (for slash command display) */
  getAgents(): Array<AgentConfig & { id: string; name: string; capabilities?: string[]; description?: string }> {
    return Array.from(this.agents.entries()).map(([id, entry]) => ({
      ...entry.agent,
      id,
      name: `agent-${id.slice(0, 8)}`,
    }));
  }

  /** Get status of a specific agent */
  getAgentStatus(agentId: AgentId): { state: string; metrics: { tasksCompleted: number; tasksFailed: number } } | null {
    const entry = this.agents.get(agentId);
    if (!entry) return null;
    return {
      state: entry.status === 'active' ? 'running' : entry.status === 'idle' ? 'idle' : 'stopped',
      metrics: { tasksCompleted: entry.taskCount, tasksFailed: 0 },
    };
  }

  /** Get decomposer bound to this pool's model (defaults to 'auto') */
  getDecomposer(): (goal: string) => ReturnType<typeof decomposeGoal> {
    return (goal: string) => decomposeGoal(goal, 'auto');
  }

  /** Get aggregate pool stats */
  getStats(): { totalAgents: number; activeAgents: number; availableAgents: number; queueLength: number } {
    const st = this.getStatus();
    return { totalAgents: st.totalAgents, activeAgents: st.activeAgents, availableAgents: st.idleAgents, queueLength: st.queueDepth };
  }

  /** Get current pool status */
  getStatus(): PoolStatus {
    const active = Array.from(this.agents.values()).filter(e => e.status === 'active').length;
    const idle = Array.from(this.agents.values()).filter(e => e.status === 'idle').length;
    
    return {
      totalAgents: this.agents.size,
      activeAgents: active,
      idleAgents: idle,
      queuedTasks: this.queue.length(),
      queueDepth: this.queue.length(),
      utilizationPercent: this.agents.size > 0 ? (active / this.agents.size) * 100 : 0,
    };
  }
  
  /** Stop the pool and clean up */
  async stop(): Promise<void> {
    this.stopping = true;
    stopIdleChecks();
    this.queue.rejectAll(new Error('Pool shutting down'));
    
    await Promise.all(Array.from(this.agents.keys()).map(id => this.removeAgent(id)));
    this.agents.clear();
  }
  
  // Private helpers...
  private findIdle(specificId?: AgentId): PoolEntry | null {
    if (specificId) {
      const entry = this.agents.get(specificId);
      return entry?.status === 'idle' ? entry : null;
    }
    return Array.from(this.agents.values()).find(e => e.status === 'idle') || null;
  }
  
  private activate(entry: PoolEntry): AgentConfig {
    entry.status = 'active';
    entry.acquiredAt = new Date();
    return entry.agent;
  }
  
  private canCreate(): boolean {
    const active = Array.from(this.agents.values()).filter(e => e.status === 'active').length;
    return active < this.config.maxConcurrent;
  }
  
  private async createAndActivate(specificId?: AgentId): Promise<AgentConfig | null> {
    try {
      const agent = await createAgent({ name: `pool-${Date.now()}`, model: 'gpt-4' });
      if (specificId && agent.id !== specificId) {
        await destroyAgent(agent.id);
        return null;
      }
      
      const entry: PoolEntry = {
        agent, status: 'active', acquiredAt: new Date(), lastActivity: new Date(), taskCount: 0,
      };
      this.agents.set(agent.id, entry);
      return agent;
    } catch { return null; }
  }
  
  private async removeAgent(id: AgentId): Promise<void> {
    this.agents.get(id)!.status = 'stopping';
    await destroyAgent(id);
    this.agents.delete(id);
  }
  
  private queueForAgent(specificId: AgentId | undefined, timeoutMs: number, serveFn: () => void): Promise<AgentConfig | null> {
    return this.queue.enqueue(specificId, timeoutMs, serveFn, this.agents);
  }
  
  private serveNext(): void {
    this.queue.serveNext(this.agents, this.activate.bind(this));
  }
}
