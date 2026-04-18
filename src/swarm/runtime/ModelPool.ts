// @ts-nocheck
/**
 * swarm/runtime/ModelPool.ts — L1: Model Pool with adaptive routing
 */
import type { ModelTier, Agent, Task } from '../types.js';

export const MODEL_POOL: ModelTier[] = [
  {
    name: 'premium',
    models: ['gpt-4', 'claude-3-opus', 'gemini-2.5-pro'],
    costPer1KTokens: 0.03,
    quality: 0.95,
    speed: 50,
    reliability: 0.99,
  },
  {
    name: 'standard',
    models: ['gpt-4o', 'claude-3-sonnet', 'gemini-2.0-flash'],
    costPer1KTokens: 0.01,
    quality: 0.90,
    speed: 100,
    reliability: 0.98,
  },
  {
    name: 'economy',
    models: ['deepseek-chat', 'qwen-72b', 'gemma-2-27b'],
    costPer1KTokens: 0.002,
    quality: 0.80,
    speed: 200,
    reliability: 0.95,
  },
  {
    name: 'local',
    models: ['ollama-qwen', 'ollama-gemma', 'ollama-phi'],
    costPer1KTokens: 0.0001,
    quality: 0.70,
    speed: 500,
    reliability: 0.90,
  },
];

export interface Budget {
  total: number;
  spent: number;
  remaining: number;
  dailyLimit: number;
}

export class AdaptiveModelRouter {
  private pool = MODEL_POOL;
  
  selectModel(task: Task, budget: Budget): string {
    // Critical tasks get premium if budget allows
    if (task.critical && budget.remaining > 0.1) {
      return this.selectFromTier('premium');
    }
    
    // Complex tasks get standard
    if (task.complexity > 0.8 && budget.remaining > 0.05) {
      return this.selectFromTier('standard');
    }
    
    // Verification tasks can use economy
    if (task.type === 'verification') {
      return this.selectFromTier('economy');
    }
    
    // Default to local for simple tasks
    return this.selectFromTier('local');
  }
  
  selectFromTier(tierName: 'premium' | 'standard' | 'economy' | 'local'): string {
    const tier = this.pool.find(t => t.name === tierName);
    if (!tier) return 'ollama-qwen'; // fallback
    
    // Round-robin within tier
    return tier.models[Math.floor(Math.random() * tier.models.length)];
  }
  
  getVerificationQuorum(task: Task): number {
    if (task.securityCritical) return 5;
    if (task.critical) return 3;
    if (task.complexity > 0.5) return 2;
    return 1;
  }
  
  estimateCost(task: Task): number {
    const tier = this.selectTierForTask(task);
    const tokens = this.estimateTokens(task);
    return (tokens / 1000) * tier.costPer1KTokens;
  }
  
  private selectTierForTask(task: Task): ModelTier {
    if (task.critical) return MODEL_POOL[0];
    if (task.complexity > 0.8) return MODEL_POOL[1];
    if (task.type === 'verification') return MODEL_POOL[2];
    return MODEL_POOL[3];
  }
  
  private estimateTokens(task: Task): number {
    // Rough estimation based on task complexity
    const base = 1000;
    const complexity = task.complexity * 2000;
    const description = task.description.length * 0.5;
    return Math.round(base + complexity + description);
  }
}

export class AgentPool {
  private agents = new Map<string, Agent>();
  private minIdle = 10;
  private maxBurst = 100;
  
  constructor() {
    this.initializePool();
  }
  
  private initializePool(): void {
    // Pre-warm minimum idle agents
    for (let i = 0; i < this.minIdle; i++) {
      this.createAgent(`idle-${i}`, 'local');
    }
  }
  
  createAgent(id: string, tier: 'premium' | 'standard' | 'economy' | 'local'): Agent {
    const agent: Agent = {
      id: id as unknown as AgentID,
      name: `Agent-${id}`,
      role: 'api',
      model: new AdaptiveModelRouter().selectFromTier(tier),
      systemPrompt: 'You are a software engineering agent.',
      capabilities: ['code-generation', 'code-review'],
      costTier: tier,
      status: 'idle',
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTaskDuration: 0,
        totalCost: 0,
        lastActive: new Date().toISOString(),
      }
    };
    this.agents.set(id, agent);
    return agent;
  }
  
  getAvailableAgent(): Agent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle') {
        return agent;
      }
    }
    
    // Scale up if below max
    if (this.agents.size < this.maxBurst) {
      return this.createAgent(`scaled-${Date.now()}`, 'local');
    }
    
    return undefined;
  }
  
  assignTask(agentId: string, taskId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'idle') return false;
    
    agent.status = 'busy';
    agent.currentTask = taskId as unknown as TaskID;
    return true;
  }
  
  releaseAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
    }
  }
  
  getMetrics(): { total: number; idle: number; busy: number; error: number } {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      idle: agents.filter(a => a.status === 'idle').length,
      busy: agents.filter(a => a.status === 'busy').length,
      error: agents.filter(a => a.status === 'error').length,
    };
  }
}
