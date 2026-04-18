/**
 * swarm/orchestration/ColonyManager.ts — L4: Colony management and task orchestration
 */
import type { Colony, Task, AgentID, Domain, DependencyGraph, Budget } from '../types.js';
import { AgentPool } from '../runtime/ModelPool.js';
import { WorkerSwarm } from '../agents/WorkerAgent.js';
import { VerificationQuorum } from '../agents/VerificationQuorum.js';

export interface ColonyConfig {
  name: string;
  domains: Domain[];
  maxAgents: number;
  budget: Budget;
}

export class ColonyManager {
  private colony: Colony;
  private pool: AgentPool;
  private swarm: WorkerSwarm;
  private quorum: VerificationQuorum;
  private dependencyGraph: DependencyGraph = { nodes: new Map(), edges: new Map() };
  
  constructor(config: ColonyConfig) {
    this.pool = new AgentPool();
    this.swarm = new WorkerSwarm(this.pool);
    this.quorum = new VerificationQuorum();
    
    this.colony = {
      id: `colony-${Date.now()}`,
      name: config.name,
      domains: config.domains,
      agents: new Map(),
      tasks: new Map(),
      workspace: {
        documents: new Map(),
        transforms: { pending: [], applied: [], transform: (a, b) => [a, b] },
        presence: new Map(),
        commits: [],
      },
      budget: config.budget,
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        activeAgents: 0,
        averageTaskDuration: 0,
        costPerTask: 0,
        qualityScore: 0,
        mergeConflictRate: 0,
      }
    };
    
    this.initializeSwarm(config.maxAgents);
  }
  
  private initializeSwarm(maxAgents: number): void {
    const roles = ['api', 'db', 'ui', 'auth', 'test', 'doc', 'devops', 'integration', 'qa'] as const;
    
    for (let i = 0; i < maxAgents; i++) {
      const role = roles[i % roles.length];
      this.swarm.createWorker(`agent-${i}`, {
        role,
        capabilities: ['code-generation', 'code-review'],
        preferredModel: 'gpt-4o',
        systemPrompt: `You are a ${role} engineering agent.`,
      });
    }
  }
  
  addTask(task: Omit<Task, 'id' | 'status'>): Task {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` as unknown as Task['id'];
    
    const fullTask: Task = {
      ...task,
      id,
      status: 'pending',
      dependencies: task.dependencies || [],
    };
    
    this.colony.tasks.set(id, fullTask);
    this.dependencyGraph.nodes.set(id, fullTask);
    this.dependencyGraph.edges.set(id, fullTask.dependencies);
    
    this.colony.metrics.totalTasks++;
    
    return fullTask;
  }
  
  async processQueue(): Promise<void> {
    const pendingTasks = Array.from(this.colony.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0)); // Critical first
    
    for (const task of pendingTasks) {
      // Check dependencies
      const depsSatisfied = task.dependencies.every(depId => {
        const dep = this.colony.tasks.get(depId);
        return dep?.status === 'completed';
      });
      
      if (!depsSatisfied) {
        task.status = 'blocked';
        continue;
      }
      
      if (this.colony.budget.remaining <= 0) {
        console.log('Budget exhausted, pausing queue');
        break;
      }
      
      // Dispatch to worker
      task.status = 'assigned';
      const result = await this.swarm.dispatchTask(task);
      
      if (result.success) {
        task.status = 'verifying';
        
        // Run verification
        const verification = await this.quorum.verify(result.output, task);
        
        if (verification.approved) {
          task.status = 'completed';
          task.verification = verification;
          this.colony.metrics.completedTasks++;
        } else {
          task.status = 'failed';
          this.colony.metrics.failedTasks++;
        }
        
        this.colony.budget.spent += verification.cost;
        this.colony.budget.remaining -= verification.cost;
      } else {
        task.status = 'failed';
        this.colony.metrics.failedTasks++;
      }
    }
  }
  
  findCriticalPath(): Task['id'][] {
    // Find tasks with most dependents
    const dependentCount = new Map<Task['id'], number>();
    
    for (const [id, deps] of this.dependencyGraph.edges) {
      for (const dep of deps) {
        dependentCount.set(dep, (dependentCount.get(dep) || 0) + 1);
      }
    }
    
    // Sort by number of dependents (most = most critical)
    return Array.from(dependentCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 10);
  }
  
  suggestResourceAllocation(): { taskId: Task['id']; recommendedAgents: number }[] {
    const criticalPath = this.findCriticalPath();
    
    return criticalPath.map(id => ({
      taskId: id,
      recommendedAgents: 2, // Double agents for critical tasks
    }));
  }
  
  getMetrics(): Colony['metrics'] {
    // Recalculate dynamic metrics
    const tasks = Array.from(this.colony.tasks.values());
    const completed = tasks.filter(t => t.status === 'completed');
    
    if (completed.length > 0) {
      this.colony.metrics.averageTaskDuration = 
        completed.reduce((sum, t) => {
          if (t.startedAt && t.completedAt) {
            return sum + (new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime());
          }
          return sum;
        }, 0) / completed.length;
      
      this.colony.metrics.costPerTask = 
        this.colony.budget.spent / completed.length;
    }
    
    this.colony.metrics.activeAgents = this.swarm.getStats().busy;
    
    return this.colony.metrics;
  }
  
  getStatus(): {
    name: string;
    tasks: { pending: number; inProgress: number; completed: number; failed: number };
    budget: { spent: number; remaining: number };
    agents: { total: number; idle: number; busy: number };
  } {
    const tasks = Array.from(this.colony.tasks.values());
    
    return {
      name: this.colony.name,
      tasks: {
        pending: tasks.filter(t => t.status === 'pending').length,
        inProgress: tasks.filter(t => t.status === 'in-progress' || t.status === 'assigned').length,
        completed: this.colony.metrics.completedTasks,
        failed: this.colony.metrics.failedTasks,
      },
      budget: {
        spent: this.colony.budget.spent,
        remaining: this.colony.budget.remaining,
      },
      agents: this.swarm.getStats(),
    };
  }
}
