/**
 * agent/orchestration/types.ts — Core orchestration types
 * Phase 1: Foundation for multi-agent auto-orchestration
 * Inspired by Open-Multi-Agent patterns
 */

import type { AgentConfig } from '../spawn/types.js';

/** Unique identifier for tasks and agents */
export type TaskId = string;
export type AgentId = string;
export type TeamId = string;

/** Task status in lifecycle */
export type TaskStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'blocked' 
  | 'cancelled';

/** Task with dependencies forming a DAG */
export interface Task {
  id: TaskId;
  name: string;
  description: string;
  agentId?: AgentId;
  prompt: string;
  dependsOn: TaskId[];
  status: TaskStatus;
  output?: string;
  error?: string;
  maxRetries: number;
  retryCount: number;
  retryDelayMs: number;
  retryBackoff: 'fixed' | 'exponential';
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

/** Team of collaborating agents */
export interface Team {
  id: TeamId;
  name: string;
  agents: AgentConfig[];
  coordinator?: AgentConfig;
  sharedMemory: boolean;
  maxParallel: number;
  metadata?: Record<string, unknown>;
}

/** Directed Acyclic Graph of tasks */
export interface TaskDAG {
  tasks: Map<TaskId, Task>;
  roots: TaskId[];
  leaves: TaskId[];
}

/** Result of executing a team */
export interface TeamResult {
  teamId: TeamId;
  success: boolean;
  results: Map<TaskId, TaskResult>;
  executionOrder: TaskId[];
  durationMs: number;
  errors: Array<{ taskId: TaskId; error: string }>;
}

/** Result of a single task */
export interface TaskResult {
  taskId: TaskId;
  success: boolean;
  output?: string;
  error?: string;
  retries: number;
  durationMs: number;
  agentId?: AgentId;
}

/** Named agent for parallel fan-out (distinct from spawn AgentConfig) */
export interface ParallelAgent {
  id: string;
  name: string;
  systemPrompt?: string;
  model?: string;
}

/** Parallel execution configuration */
export interface ParallelConfig {
  agents: ParallelAgent[];
  input: string;
  aggregator?: ParallelAgent;
  maxConcurrency: number;
  timeoutMs: number;
}

/** Parallel execution result */
export interface ParallelResult {
  success: boolean;
  individual: Map<AgentId, TaskResult>;
  aggregated?: TaskResult;
  durationMs: number;
}

/** Auto-decomposition result */
export interface DecompositionResult {
  goal: string;
  tasks: Task[];
  dependencies: Array<[TaskId, TaskId]>;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/** Agent pool configuration */
export interface AgentPoolConfig {
  maxConcurrent: number;
  queueStrategy: 'fifo' | 'priority' | 'fair';
  autoScale: boolean;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  idleTimeoutMs: number;
}

/** Pool resource status */
export interface PoolStatus {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  queuedTasks: number;
  queueDepth: number;
  utilizationPercent: number;
}

/** Trace span for observability */
export interface TraceSpan {
  spanId: string;
  parentId?: string;
  runId: string;
  type: 'llm' | 'tool' | 'task' | 'agent';
  name: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  metadata: Record<string, unknown>;
  error?: string;
}

/** Trace handler callback */
export type TraceHandler = (span: TraceSpan) => void | Promise<void>;

/** Orchestrator configuration */
export interface OrchestratorConfig {
  traceHandler?: TraceHandler;
  defaultMaxRetries: number;
  defaultRetryDelayMs: number;
  defaultRetryBackoff: 'fixed' | 'exponential';
  poolConfig: AgentPoolConfig;
}
