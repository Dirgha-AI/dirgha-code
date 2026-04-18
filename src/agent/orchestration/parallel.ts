/**
 * agent/orchestration/parallel.ts — MapReduce parallel execution
 * Phase 1: Fan-out to multiple agents, aggregate results
 * Inspired by Open-Multi-Agent patterns
 */

import type { ParallelAgent, ParallelConfig, ParallelResult, TaskResult, TraceSpan } from './types.js';
import { callModel } from '../../providers/index.js';
import type { ContentBlock } from '../../types.js';
import { getDefaultModel } from '../../providers/detection.js';

/** Extract plain text from a ContentBlock array */
function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('');
}

/** Execute agents in parallel with optional aggregation */
export async function runParallel(
  config: ParallelConfig,
  traceHandler?: (span: TraceSpan) => void | Promise<void>
): Promise<ParallelResult> {
  const startTime = Date.now();
  const runId = generateRunId();
  const individual = new Map<string, TaskResult>();

  // Create execution promises with concurrency limit
  const semaphore = new Semaphore(config.maxConcurrency);
  const promises = config.agents.map(agent =>
    semaphore.run(async () => {
      const result = await runAgentTask(agent, config.input, traceHandler, runId);
      individual.set(agent.id, result);
      return result;
    })
  );

  // Wait for all agents to complete
  await Promise.all(promises);

  // Aggregate if aggregator specified
  let aggregated: TaskResult | undefined;
  if (config.aggregator) {
    aggregated = await aggregateResults(
      config.aggregator,
      config.input,
      individual,
      traceHandler,
      runId
    );
  }

  const success = Array.from(individual.values()).every(r => r.success);

  return {
    success,
    individual,
    aggregated,
    durationMs: Date.now() - startTime,
  };
}

/** Run a single agent task */
async function runAgentTask(
  agent: ParallelAgent,
  input: string,
  traceHandler?: (span: TraceSpan) => void | Promise<void>,
  runId?: string
): Promise<TaskResult> {
  const startTime = Date.now();
  const spanId = generateSpanId();

  const span: TraceSpan = {
    spanId,
    runId: runId ?? '',
    type: 'agent',
    name: agent.name,
    startTime: new Date(),
    metadata: {
      agentId: agent.id,
      model: agent.model,
    },
  };

  try {
    const systemPrompt = agent.systemPrompt ?? 'You are a helpful assistant.';
    const model = agent.model ?? getDefaultModel();
    const messages = [{ role: 'user' as const, content: input }];

    const response = await callModel(messages, systemPrompt, model);
    const output = extractText(response.content);

    span.endTime = new Date();
    span.durationMs = Date.now() - startTime;
    traceHandler?.(span);

    return {
      taskId: agent.id,
      success: true,
      output,
      retries: 0,
      durationMs: Date.now() - startTime,
      agentId: agent.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span.endTime = new Date();
    span.durationMs = Date.now() - startTime;
    span.error = errorMsg;
    traceHandler?.(span);

    return {
      taskId: agent.id,
      success: false,
      error: errorMsg,
      retries: 0,
      durationMs: Date.now() - startTime,
      agentId: agent.id,
    };
  }
}

/** Aggregate parallel results */
async function aggregateResults(
  aggregator: ParallelAgent,
  originalInput: string,
  results: Map<string, TaskResult>,
  traceHandler?: (span: TraceSpan) => void | Promise<void>,
  runId?: string
): Promise<TaskResult> {
  const startTime = Date.now();
  const spanId = generateSpanId();

  const span: TraceSpan = {
    spanId,
    runId: runId ?? '',
    type: 'agent',
    name: `${aggregator.name}-aggregate`,
    startTime: new Date(),
    metadata: {
      agentId: aggregator.id,
      resultCount: results.size,
    },
  };

  // Build aggregation prompt
  const successfulResults = Array.from(results.entries())
    .filter(([, r]) => r.success)
    .map(([id, r]) => `Agent ${id}:\n${r.output}`)
    .join('\n\n---\n\n');

  const aggregationPrompt = `Synthesize the following agent outputs into a coherent response:\n\nOriginal request: ${originalInput}\n\n${successfulResults}`;

  try {
    const systemPrompt = aggregator.systemPrompt ?? 'You synthesize multiple perspectives into a unified response.';
    const model = aggregator.model ?? getDefaultModel();
    const messages = [{ role: 'user' as const, content: aggregationPrompt }];

    const response = await callModel(messages, systemPrompt, model);
    const output = extractText(response.content);

    span.endTime = new Date();
    span.durationMs = Date.now() - startTime;
    traceHandler?.(span);

    return {
      taskId: 'aggregate',
      success: true,
      output,
      retries: 0,
      durationMs: Date.now() - startTime,
      agentId: aggregator.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span.endTime = new Date();
    span.durationMs = Date.now() - startTime;
    span.error = errorMsg;
    traceHandler?.(span);

    return {
      taskId: 'aggregate',
      success: false,
      error: errorMsg,
      retries: 0,
      durationMs: Date.now() - startTime,
      agentId: aggregator.id,
    };
  }
}

/** Semaphore for limiting concurrency */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(initialPermits: number) {
    this.permits = initialPermits;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise(resolve => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

/** Generate unique run ID */
function generateRunId(): string {
  return `parallel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Generate unique span ID */
function generateSpanId(): string {
  return `span-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
