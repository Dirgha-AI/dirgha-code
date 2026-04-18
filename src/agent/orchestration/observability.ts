/**
 * agent/orchestration/observability.ts — Tracing and observability for agents
 * 
 * Implements OpenTelemetry-style tracing with onTrace callbacks.
 * Provides visibility into multi-agent execution flow.
 * 
 * @module agent/orchestration/observability
 */

/**
 * Span kinds for different types of operations
 */
export type SpanKind = 
  | 'internal'      // Internal agent logic
  | 'llm'          // LLM API call
  | 'tool'         // Tool execution
  | 'agent'        // Agent execution
  | 'workflow'     // Workflow/DAG execution
  | 'messaging'    // Message bus operations
  | 'consensus';   // Consensus operations

/**
 * Span status
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Trace span representing an operation
 */
export interface Span {
  id: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  error?: Error;
}

/**
 * Event within a span
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

/**
 * Complete trace
 */
export interface Trace {
  id: string;
  rootSpanId: string;
  spans: Map<string, Span>;
  startTime: number;
  endTime?: number;
}

/**
 * Callback for trace events
 */
export type TraceCallback = (trace: Trace, span: Span, event: 'start' | 'end' | 'event') => void;

/**
 * Tracer for creating and managing spans
 */
export class Tracer {
  private traces = new Map<string, Trace>();
  private activeSpans = new Map<string, Span>();
  private callbacks: TraceCallback[] = [];
  
  constructor(private readonly name: string) {}
  
  /**
   * Register a trace callback
   */
  onTrace(callback: TraceCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }
  
  /**
   * Start a new trace
   */
  startTrace(name: string, attributes: Record<string, unknown> = {}): string {
    const traceId = this.generateId();
    const spanId = this.generateId();
    const now = Date.now();
    
    const rootSpan: Span = {
      id: spanId,
      name,
      kind: 'workflow',
      startTime: now,
      status: 'ok',
      attributes,
      events: []
    };
    
    const trace: Trace = {
      id: traceId,
      rootSpanId: spanId,
      spans: new Map([[spanId, rootSpan]]),
      startTime: now
    };
    
    this.traces.set(traceId, trace);
    this.activeSpans.set(spanId, rootSpan);
    
    this.notify(trace, rootSpan, 'start');
    return traceId;
  }
  
  /**
   * Start a child span
   */
  startSpan(
    traceId: string,
    name: string,
    kind: SpanKind,
    parentId: string,
    attributes: Record<string, unknown> = {}
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) throw new Error(`Trace ${traceId} not found`);
    
    const spanId = this.generateId();
    const span: Span = {
      id: spanId,
      parentId,
      name,
      kind,
      startTime: Date.now(),
      status: 'ok',
      attributes,
      events: []
    };
    
    trace.spans.set(spanId, span);
    this.activeSpans.set(spanId, span);
    
    this.notify(trace, span, 'start');
    return spanId;
  }
  
  /**
   * Add event to span
   */
  addEvent(
    traceId: string,
    spanId: string,
    name: string,
    attributes?: Record<string, unknown>
  ): void {
    const trace = this.traces.get(traceId);
    const span = trace?.spans.get(spanId);
    if (!span) return;
    
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes
    });
    
    this.notify(trace!, span, 'event');
  }
  
  /**
   * End a span
   */
  endSpan(traceId: string, spanId: string, error?: Error): void {
    const trace = this.traces.get(traceId);
    const span = trace?.spans.get(spanId);
    if (!span || span.endTime) return;
    
    span.endTime = Date.now();
    span.status = error ? 'error' : 'ok';
    span.error = error;
    
    this.activeSpans.delete(spanId);
    if (!trace) return;
    this.notify(trace, span, 'end');

    // If this is the root span, end the trace
    if (trace.rootSpanId === spanId) {
      trace.endTime = span.endTime;
    }
  }
  
  /**
   * Get trace data
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }
  
  /**
   * Get all traces
   */
  getAllTraces(): Trace[] {
    return Array.from(this.traces.values());
  }
  
  /**
   * Get active spans
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }
  
  /**
   * Export trace as JSON (OpenTelemetry compatible)
   */
  exportTrace(traceId: string): Record<string, unknown> | undefined {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    
    return {
      traceId: trace.id,
      startTime: trace.startTime,
      endTime: trace.endTime,
      spans: Array.from(trace.spans.values()).map(s => ({
        spanId: s.id,
        parentSpanId: s.parentId,
        name: s.name,
        kind: s.kind,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMs: s.endTime ? s.endTime - s.startTime : undefined,
        status: s.status,
        attributes: s.attributes,
        events: s.events,
        error: s.error?.message
      }))
    };
  }
  
  /**
   * Clear completed traces
   */
  clearCompleted(olderThanMs = 3600000): number {
    let cleared = 0;
    const cutoff = Date.now() - olderThanMs;
    
    for (const [id, trace] of this.traces) {
      if (trace.endTime && trace.endTime < cutoff) {
        this.traces.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }
  
  private generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private notify(trace: Trace, span: Span, event: 'start' | 'end' | 'event'): void {
    for (const callback of this.callbacks) {
      try {
        callback(trace, span, event);
      } catch {
        // Silently ignore callback errors
      }
    }
  }
}

/**
 * Global tracer instance
 */
export const globalTracer = new Tracer('dirgha');

/**
 * Decorator for automatic span creation
 */
export function withSpan<T extends (...args: unknown[]) => unknown>(
  name: string,
  kind: SpanKind,
  fn: T
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const traceId = globalTracer.startTrace(name);
    const spanId = globalTracer.startSpan(traceId, name, kind, traceId);
    
    try {
      const result = await fn(...args);
      globalTracer.endSpan(traceId, spanId);
      return result as ReturnType<T>;
    } catch (error) {
      globalTracer.endSpan(traceId, spanId, error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Console trace exporter for debugging
 */
export function createConsoleExporter(): TraceCallback {
  return (trace, span, event) => {
    const indent = '  '.repeat(getDepth(trace, span));
    const timestamp = new Date().toISOString();
    
    switch (event) {
      case 'start':
        console.log(`${timestamp} ${indent}▶ ${span.name} [${span.kind}]`);
        break;
      case 'end':
        const duration = span.endTime! - span.startTime;
        const symbol = span.status === 'error' ? '✗' : '✓';
        console.log(`${timestamp} ${indent}${symbol} ${span.name} (${duration}ms)${span.error ? ` - ${span.error.message}` : ''}`);
        break;
      case 'event':
        const lastEvent = span.events[span.events.length - 1];
        console.log(`${timestamp} ${indent}• ${lastEvent?.name}`);
        break;
    }
  };
}

function getDepth(trace: Trace, span: Span): number {
  let depth = 0;
  let current = span;
  while (current.parentId) {
    depth++;
    current = trace.spans.get(current.parentId) || current;
    if (current.id === current.parentId) break;
  }
  return depth;
}
