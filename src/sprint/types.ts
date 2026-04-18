/**
 * Dirgha CLI Sprint Engine - Core Type Definitions
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused';

export type SprintStatus = 'running' | 'paused' | 'completed' | 'aborted';

export type OnFail = 'retry' | 'skip' | 'pause' | 'abort';

export type VerificationType = 'file_exists' | 'file_count' | 'build' | 'test' | 'type_check' | 'contains' | 'llm_judge' | 'shell';

export type EventType = string;

export interface VerificationCriterion {
  type: VerificationType;
  path?: string;
  glob?: string;
  min?: number;
  command?: string;
  cwd?: string;
  expect_exit?: number;
  timeout_seconds?: number;
  must_contain?: string;
  prompt?: string;
  model?: string;
  pass_threshold?: number;
}

export interface VerificationResult {
  type: VerificationType;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface SprintTask {
  id: string;
  title: string;
  prompt: string;
  dependsOn: string[];
  estimatedMinutes: number;
  onFail: OnFail;
  maxRetries: number;
  verification: VerificationCriterion[];
}

export interface SprintNotifyConfig {
  whatsapp: boolean;
  onComplete: boolean;
  onBlocked: boolean;
  onTaskDone: boolean;
}

export interface SprintEscalationConfig {
  onRepeatedFailure: OnFail;
  maxRetriesDefault: number;
  costThresholdUsd: number;
  timeMultiplier: number;
}

export interface SprintManifest {
  id: string;
  goal: string;
  created: string;
  model: string;
  cwd: string;
  maxDurationHours: number;
  maxParallel: number;
  notify: SprintNotifyConfig;
  escalation: SprintEscalationConfig;
  tasks: SprintTask[];
}

export interface TaskStateRow {
  taskId: string;
  sprintId: string;
  status: TaskStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  gitSha?: string;
  verifyLog?: VerificationResult[];
  agentOutput?: string;
  errorLog?: string;
}

export interface JournalEvent {
  id?: string;
  sprintId: string;
  taskId?: string;
  ts: string;
  type: EventType;
  payload?: Record<string, unknown>;
  gitSha?: string;
}

export interface SprintProgress {
  sprintId: string;
  goal: string;
  status: SprintStatus;
  tasks: Array<TaskStateRow & { title: string; estimatedMinutes: number }>;
  startedAt?: string;
  elapsedMs: number;
  currentTask?: string;
  lastCommit?: string;
}
