/**
 * agent/orchestration/retry.ts — Retry policies with exponential backoff
 * Phase 1: Task retry with configurable backoff strategies
 */

import type { Task, TaskResult, TraceSpan } from './types.js';
import type { AgentConfig } from '../spawn/types.js';
import { getDefaultModel } from '../../providers/detection.js';
import { callModel } from '../../providers/index.js';
import type { ContentBlock } from '../../types.js';

function extractText(blocks: ContentBlock[]): string {
  return blocks.filter(b => b.type === 'text' && b.text).map(b => b.text!).join('');
}

interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  retryBackoff: 'fixed' | 'exponential';
}

/** Run a task with retry logic */
export async function runTaskWithRetry(
  task: Task,
  agent: AgentConfig,
  config: RetryConfig,
  traceHandler?: (span: TraceSpan) => void | Promise<void>,
  runId?: string
): Promise<TaskResult> {
  let lastError: string | undefined;
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const spanId = generateSpanId();
    const spanStart = Date.now();
    
    try {
      // Create span for observability
      const span: TraceSpan = {
        spanId,
        runId: runId ?? '',
        type: 'task',
        name: task.name,
        startTime: new Date(spanStart),
        metadata: {
          taskId: task.id,
          attempt,
          agentId: agent.type,
        },
      };
      
      // Execute the task
      const result = await executeTaskPrompt(task, agent);
      
      // Complete span
      span.endTime = new Date();
      span.durationMs = Date.now() - spanStart;
      traceHandler?.(span);
      
      return {
        taskId: task.id,
        success: true,
        output: result,
        retries: attempt,
        durationMs: Date.now() - startTime,
        agentId: agent.type,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      // Create error span
      const errorSpan: TraceSpan = {
        spanId,
        runId: runId ?? '',
        type: 'task',
        name: task.name,
        startTime: new Date(spanStart),
        endTime: new Date(),
        durationMs: Date.now() - spanStart,
        error: lastError,
        metadata: {
          taskId: task.id,
          attempt,
          agentId: agent.type,
        },
      };
      traceHandler?.(errorSpan);
      
      // Don't retry if this was the last attempt
      if (attempt === config.maxRetries) {
        break;
      }
      
      // Calculate delay before next retry
      const delay = calculateRetryDelay(config, attempt);
      await sleep(delay);
    }
  }
  
  return {
    taskId: task.id,
    success: false,
    error: lastError || 'Task failed after all retries',
    retries: config.maxRetries,
    durationMs: Date.now() - startTime,
    agentId: agent.type,
  };
}

/** Execute task prompt with agent */
async function executeTaskPrompt(
  task: Task,
  agent: AgentConfig
): Promise<string> {
  const systemPrompt = 'You are a helpful coding assistant.';
  const model = agent.model ?? getDefaultModel();
  const messages = [{ role: 'user' as const, content: task.prompt }];

  const response = await callModel(messages, systemPrompt, model);
  return extractText(response.content);
}

/** Calculate retry delay based on strategy */
function calculateRetryDelay(config: RetryConfig, attempt: number): number {
  if (config.retryBackoff === 'fixed') {
    return config.retryDelayMs;
  }
  
  // Exponential backoff: delay * 2^attempt
  return config.retryDelayMs * Math.pow(2, attempt);
}

/** Sleep for specified milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Generate unique span ID */
function generateSpanId(): string {
  return `span-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
