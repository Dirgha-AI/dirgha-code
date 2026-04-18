/**
 * gateway/acp/registry.ts — Agent registry with discovery
 * Phase 3: Central registry for agent management
 */

import type {
  AgentInfo,
  RegistryEntry,
  AcpDiscoverPayload,
} from './types.js';
import type { AgentId } from '../../agent/orchestration/types.js';

export class AgentRegistry {
  private agents = new Map<AgentId, RegistryEntry>();
  private capabilities = new Map<string, Set<AgentId>>();
  
  /** Register a new agent */
  register(agent: AgentInfo): boolean {
    if (this.agents.has(agent.id)) return false;
    
    const entry: RegistryEntry = {
      agent,
      registeredAt: new Date(),
      lastSeen: new Date(),
      messageCount: 0,
      status: 'online',
    };
    
    this.agents.set(agent.id, entry);
    
    // Index capabilities
    for (const cap of agent.capabilities) {
      const set = this.capabilities.get(cap.name) || new Set();
      set.add(agent.id);
      this.capabilities.set(cap.name, set);
    }
    
    return true;
  }
  
  /** Unregister an agent */
  unregister(agentId: AgentId): boolean {
    const entry = this.agents.get(agentId);
    if (!entry) return false;
    
    // Remove capability indices
    for (const cap of entry.agent.capabilities) {
      const set = this.capabilities.get(cap.name);
      if (set) {
        set.delete(agentId);
        if (set.size === 0) {
          this.capabilities.delete(cap.name);
        }
      }
    }
    
    return this.agents.delete(agentId);
  }
  
  /** Get agent by ID */
  get(agentId: AgentId): RegistryEntry | undefined {
    return this.agents.get(agentId);
  }
  
  /** Check if agent exists */
  has(agentId: AgentId): boolean {
    return this.agents.has(agentId);
  }
  
  /** Update agent status */
  updateStatus(agentId: AgentId, status: RegistryEntry['status']): boolean {
    const entry = this.agents.get(agentId);
    if (!entry) return false;
    
    entry.status = status;
    entry.lastSeen = new Date();
    return true;
  }
  
  /** Record heartbeat */
  heartbeat(agentId: AgentId): boolean {
    return this.updateStatus(agentId, 'online');
  }
  
  /** Increment message count */
  recordMessage(agentId: AgentId): void {
    const entry = this.agents.get(agentId);
    if (entry) {
      entry.messageCount++;
      entry.lastSeen = new Date();
    }
  }
  
  /** Find agents by capability */
  findByCapability(capability: string): AgentInfo[] {
    const ids = this.capabilities.get(capability);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.agents.get(id)?.agent)
      .filter((a): a is AgentInfo => a !== undefined);
  }
  
  /** Discover agents by query */
  discover(query: AcpDiscoverPayload): AgentInfo[] {
    let results = Array.from(this.agents.values())
      .filter(e => e.status !== 'offline')
      .map(e => e.agent);
    
    // Filter by capabilities
    if (query.capabilities && query.capabilities.length > 0) {
      results = results.filter(agent =>
        query.capabilities!.some(cap =>
          agent.capabilities.some(c => c.name === cap)
        )
      );
    }
    
    // Filter by name/description query
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter(agent =>
        agent.name.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q)
      );
    }
    
    // Sort by trust level and limit
    results.sort((a, b) => {
      const trustOrder = { trusted: 3, verified: 2, basic: 1, anonymous: 0 };
      return trustOrder[b.trustLevel] - trustOrder[a.trustLevel];
    });
    
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
  
  /** Get all online agents */
  getOnline(): RegistryEntry[] {
    return Array.from(this.agents.values())
      .filter(e => e.status === 'online');
  }
  
  /** Get all agents */
  getAll(): RegistryEntry[] {
    return Array.from(this.agents.values());
  }
  
  /** Get capability catalog */
  getCapabilities(): string[] {
    return Array.from(this.capabilities.keys());
  }
  
  /** Get agents by trust level */
  getByTrustLevel(level: AgentInfo['trustLevel']): AgentInfo[] {
    return Array.from(this.agents.values())
      .filter(e => e.agent.trustLevel === level)
      .map(e => e.agent);
  }
  
  /** Clean stale agents */
  cleanStale(maxAgeMinutes: number = 10): number {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - maxAgeMinutes);
    
    let cleaned = 0;
    for (const [id, entry] of this.agents) {
      if (entry.lastSeen < cutoff) {
        this.unregister(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /** Get registry statistics */
  getStats(): {
    totalAgents: number;
    onlineAgents: number;
    totalCapabilities: number;
    avgMessagesPerAgent: number;
  } {
    const total = this.agents.size;
    const online = this.getOnline().length;
    const totalMessages = Array.from(this.agents.values())
      .reduce((sum, e) => sum + e.messageCount, 0);
    
    return {
      totalAgents: total,
      onlineAgents: online,
      totalCapabilities: this.capabilities.size,
      avgMessagesPerAgent: total > 0 ? totalMessages / total : 0,
    };
  }
  
  /** Export to JSON */
  toJSON(): Record<string, unknown> {
    return {
      agents: Array.from(this.agents.values()),
      capabilities: Array.from(this.capabilities.entries()).map(([cap, ids]) => ({
        name: cap,
        agents: Array.from(ids),
      })),
    };
  }
  
  /** Clear all agents */
  clear(): void {
    this.agents.clear();
    this.capabilities.clear();
  }
}

/** Create global registry */
export const globalRegistry = new AgentRegistry();
