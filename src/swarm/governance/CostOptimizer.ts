// @ts-nocheck
/**
 * swarm/governance/CostOptimizer.ts — L5: Cost optimization and budget enforcement
 */
import type { CostStrategy, Task, ModelTier } from '../types.js';
import { MODEL_POOL } from '../runtime/ModelPool.js';

export interface OptimizedQueue {
  queue: Task[];
  estimatedCost: number;
  estimatedTime: number;
}

export class CostOptimizer {
  private strategy: CostStrategy = {
    agentPool: {
      minIdle: 10,
      maxBurst: 100,
      scaleUpTime: 30,
    },
    batching: {
      enabled: true,
      windowMs: 5000,
      similarityThreshold: 0.8,
    },
    caching: {
      semantic: true,
      deterministic: true,
      ttlSeconds: 3600,
    },
    localVerification: {
      enabled: true,
      threshold: 0.95,
    },
  };
  
  private cache = new Map<string, { result: string; timestamp: number }>();
  
  setStrategy(strategy: Partial<CostStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy };
  }
  
  async optimize(taskQueue: Task[]): Promise<OptimizedQueue> {
    // 1. Batch similar tasks
    const batched = this.strategy.batching.enabled 
      ? this.createBatches(taskQueue)
      : taskQueue.map(t => [t]);
    
    // 2. Route to cost-effective models
    const routed = batched.flatMap(batch => this.routeToCostEffectiveModels(batch));
    
    // 3. Apply caching
    const cached = routed.map(task => this.applyCaching(task));
    
    // 4. Prioritize critical path
    const prioritized = this.prioritizeCriticalPath(cached);
    
    return {
      queue: prioritized,
      estimatedCost: this.calculateCost(prioritized),
      estimatedTime: this.calculateTime(prioritized),
    };
  }
  
  private createBatches(tasks: Task[]): Task[][] {
    const batches: Task[][] = [];
    const unbatched = [...tasks];
    
    while (unbatched.length > 0) {
      const task = unbatched.shift()!;
      const batch = [task];
      
      // Find similar tasks
      for (let i = unbatched.length - 1; i >= 0; i--) {
        if (this.isSimilar(task, unbatched[i])) {
          batch.push(unbatched.splice(i, 1)[0]);
        }
      }
      
      batches.push(batch);
    }
    
    return batches;
  }
  
  private isSimilar(a: Task, b: Task): boolean {
    // Simple similarity: same domain and type
    return a.domain === b.domain && a.type === b.type;
  }
  
  private routeToCostEffectiveModels(tasks: Task[]): Task[] {
    return tasks.map(task => {
      // For simple tasks, prefer economy/local models
      if (task.complexity < 0.3 && !task.critical) {
        return { ...task, preferredModel: 'ollama-qwen' };
      }
      return task;
    });
  }
  
  private applyCaching(task: Task): Task {
    if (!this.strategy.caching.enabled) return task;
    
    const cacheKey = this.generateCacheKey(task);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.strategy.caching.ttlSeconds * 1000) {
      // Mark as cached (in real impl, would skip execution)
      return { ...task, id: `cached-${task.id}` as unknown as Task['id'] };
    }
    
    return task;
  }
  
  private generateCacheKey(task: Task): string {
    return `${task.domain}-${task.type}-${task.description.slice(0, 50)}`;
  }
  
  private prioritizeCriticalPath(tasks: Task[]): Task[] {
    // Sort: critical first, then by complexity desc
    return tasks.sort((a, b) => {
      if (a.critical && !b.critical) return -1;
      if (!a.critical && b.critical) return 1;
      return b.complexity - a.complexity;
    });
  }
  
  private calculateCost(tasks: Task[]): number {
    return tasks.reduce((sum, task) => {
      const tier = this.getTierForTask(task);
      const tokens = 1000 + task.complexity * 2000;
      return sum + (tokens / 1000) * tier.costPer1KTokens;
    }, 0);
  }
  
  private calculateTime(tasks: Task[]): number {
    // Rough estimate: 30s per task + complexity factor
    return tasks.reduce((sum, task) => {
      return sum + 30 + task.complexity * 60;
    }, 0);
  }
  
  private getTierForTask(task: Task): ModelTier {
    if (task.critical) return MODEL_POOL[0];
    if (task.complexity > 0.8) return MODEL_POOL[1];
    if (task.type === 'verification') return MODEL_POOL[2];
    return MODEL_POOL[3];
  }
  
  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: 0, // Would track in real implementation
      misses: 0,
      size: this.cache.size,
    };
  }
  
  getStrategy(): CostStrategy {
    return this.strategy;
  }
}

export class BudgetEnforcer {
  private dailyLimit: number;
  private spentToday = 0;
  private lastReset = new Date().toDateString();
  
  constructor(dailyLimit: number) {
    this.dailyLimit = dailyLimit;
  }
  
  canSpend(amount: number): boolean {
    this.checkReset();
    return this.spentToday + amount <= this.dailyLimit;
  }
  
  spend(amount: number): boolean {
    this.checkReset();
    
    if (this.spentToday + amount > this.dailyLimit) {
      return false;
    }
    
    this.spentToday += amount;
    return true;
  }
  
  getRemaining(): number {
    this.checkReset();
    return this.dailyLimit - this.spentToday;
  }
  
  private checkReset(): void {
    const today = new Date().toDateString();
    if (today !== this.lastReset) {
      this.spentToday = 0;
      this.lastReset = today;
    }
  }
}
