// @ts-nocheck
/**
 * agent/orchestration/pool-scaler.ts — Auto-scaling logic for agent pool
 */
import type { AgentPoolConfig, AgentId } from './types.js';
import type { AgentConfig } from '../spawn/types.js';
import { createAgent, destroyAgent } from '../spawn/lifecycle.js';

interface PoolEntry {
  agent: AgentConfig;
  status: 'idle' | 'active' | 'stopping';
  acquiredAt?: Date;
  lastActivity: Date;
  taskCount: number;
}

export class PoolScaler {
  private config: AgentPoolConfig;
  private agents: Map<AgentId, PoolEntry>;
  
  constructor(config: AgentPoolConfig, agents: Map<AgentId, PoolEntry>) {
    this.config = config;
    this.agents = agents;
  }
  
  async scale(targetSize: number): Promise<void> {
    const current = this.agents.size;
    
    if (targetSize > current) {
      for (let i = 0; i < targetSize - current; i++) {
        await this.createIdle();
      }
    } else if (targetSize < current) {
      let removed = 0;
      for (const [id, entry] of this.agents) {
        if (entry.status === 'idle' && removed < current - targetSize) {
          await this.remove(id);
          removed++;
        }
      }
    }
    
    if (this.config.autoScale) this.checkAutoScale();
  }
  
  private async createIdle(): Promise<void> {
    try {
      const agent = await createAgent({ name: `pool-${Date.now()}`, model: 'gpt-4' });
      this.agents.set(agent.id, {
        agent, status: 'idle', lastActivity: new Date(), taskCount: 0,
      });
    } catch { /* ignore */ }
  }
  
  private async remove(id: AgentId): Promise<void> {
    this.agents.get(id)!.status = 'stopping';
    await destroyAgent(id);
    this.agents.delete(id);
  }
  
  private checkAutoScale(): void {
    const active = Array.from(this.agents.values()).filter(e => e.status === 'active').length;
    const util = this.agents.size > 0 ? active / this.agents.size : 0;
    
    if (util > this.config.scaleUpThreshold) {
      this.scale(Math.min(this.agents.size + 1, this.config.maxConcurrent * 2));
    } else if (util < this.config.scaleDownThreshold && this.agents.size > 1) {
      this.scale(this.agents.size - 1);
    }
  }
}
