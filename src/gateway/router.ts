/**
 * gateway/router.ts — Request routing for multi-agent gateway
 * Phase 3: Route requests to appropriate agents
 */

import type { AgentId } from '../agent/orchestration/types.js';
import type { AcpMessage, RoutingDecision } from './acp/types.js';
import { globalRegistry } from './acp/registry.js';

export class AgentRouter {
  private routes = new Map<string, AgentId>();
  private middleware: ((msg: AcpMessage) => AcpMessage | null)[] = [];
  
  /** Register a static route */
  registerRoute(pattern: string, target: AgentId): void {
    this.routes.set(pattern, target);
  }
  
  /** Remove a route */
  unregisterRoute(pattern: string): boolean {
    return this.routes.delete(pattern);
  }
  
  /** Add middleware */
  use(middleware: (msg: AcpMessage) => AcpMessage | null): () => void {
    this.middleware.push(middleware);
    return () => {
      const idx = this.middleware.indexOf(middleware);
      if (idx >= 0) this.middleware.splice(idx, 1);
    };
  }
  
  /** Route a message to target agent */
  route(message: AcpMessage): RoutingDecision | null {
    // Apply middleware
    let processed = message;
    for (const mw of this.middleware) {
      const result = mw(processed);
      if (!result) return null; // Blocked by middleware
      processed = result;
    }
    
    // Try static routes first
    for (const [pattern, target] of this.routes) {
      if (this.matchesPattern(processed, pattern)) {
        return {
          target,
          priority: 100,
          estimatedTime: 0,
        };
      }
    }
    
    // Try capability-based routing
    if (processed.payload && 'method' in processed.payload) {
      const method = processed.payload.method as string;
      const capableAgents = this.findByCapability(method);
      
      if (capableAgents.length > 0) {
        // Pick least loaded agent
        const target = capableAgents.reduce((best, current) => {
          const bestLoad = this.getAgentLoad(best);
          const currentLoad = this.getAgentLoad(current);
          return currentLoad < bestLoad ? current : best;
        });
        
        return {
          target: target.id,
          priority: 50,
          estimatedTime: this.estimateTime(target),
        };
      }
    }
    
    // Try to route to specified recipient
    if (processed.to) {
      const entry = globalRegistry.get(processed.to.id);
      if (entry && entry.status === 'online') {
        return {
          target: processed.to.id,
          priority: 75,
          estimatedTime: this.estimateTime(entry.agent),
        };
      }
    }
    
    return null;
  }
  
  /** Find agents by capability */
  private findByCapability(method: string) {
    return globalRegistry.discover({
      query: method,
      limit: 10,
    });
  }
  
  /** Check if message matches pattern */
  private matchesPattern(message: AcpMessage, pattern: string): boolean {
    // Simple pattern matching - can be enhanced with regex
    const payload = message.payload as Record<string, unknown>;
    if (!payload) return false;
    
    // Match by method name
    if ('method' in payload && payload.method === pattern) return true;
    
    // Match by event name
    if ('event' in payload && payload.event === pattern) return true;
    
    return false;
  }
  
  /** Get agent load (0-1) */
  private getAgentLoad(agent: { id: AgentId } | AgentId): number {
    const id = typeof agent === 'string' ? agent : agent.id;
    const entry = globalRegistry.get(id);
    if (!entry) return 1;
    
    // Simplified load calculation
    return entry.status === 'busy' ? 0.8 : entry.status === 'online' ? 0.2 : 1;
  }
  
  /** Estimate processing time */
  private estimateTime(agent: { maxConcurrent: number }): number {
    // Simplified estimation
    return 1000 / agent.maxConcurrent;
  }
  
  /** Get routing statistics */
  getStats(): {
    staticRoutes: number;
    middlewareCount: number;
    onlineAgents: number;
  } {
    return {
      staticRoutes: this.routes.size,
      middlewareCount: this.middleware.length,
      onlineAgents: globalRegistry.getOnline().length,
    };
  }
}

/** Create global router */
export const globalRouter = new AgentRouter();
