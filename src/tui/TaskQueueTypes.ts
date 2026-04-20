export interface QueuedTask {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  priority: number;
  dependsOn?: string[]; // IDs of tasks that must finish first
  abortController?: AbortController;
  error?: string;
  metadata?: Record<string, any>;
}

export interface TaskQueueStatus {
  pending: number;
  running: number; // Changed from boolean to count
  current: QueuedTask[]; // Changed from single to array
  completed: number;
  total: number;
}
