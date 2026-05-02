/**
 * Event stream: pub/sub plus async iteration over kernel events.
 *
 * Producers call emit(). Consumers either subscribe for side-effectful
 * handling or iterate via for-await. Multiple consumers are allowed;
 * each independent iterator receives all events from its subscription
 * onward. Back-pressure is bounded by an internal queue; when the
 * queue overflows, a backpressure event is emitted (once per overflow
 * start) and the oldest event is dropped. Slow consumers can call
 * drain() to await queue emptying.
 */

import type { AgentEvent } from "./types.js";

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

export interface EventStream {
  emit(event: AgentEvent): void;
  subscribe(handler: EventHandler): () => void;
  iterator(): AsyncIterableIterator<AgentEvent>;
  /** Resolves when the internal queue is empty (no pending events). */
  drain(): Promise<void>;
  close(): void;
  readonly closed: boolean;
}

const MAX_QUEUE = 4096;

interface Waiter {
  resolve: (value: IteratorResult<AgentEvent>) => void;
}

class EventStreamImpl implements EventStream {
  private subscribers = new Set<EventHandler>();
  private iterators = new Set<IteratorState>();
  closed = false;

  emit(event: AgentEvent): void {
    if (this.closed) return;
    for (const handler of this.subscribers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            if (event.type !== "error") {
              this.emit({
                type: "error",
                message: `handler failed: ${String(err)}`,
              });
            }
          });
        }
      } catch (err) {
        if (event.type !== "error") {
          this.emit({
            type: "error",
            message: `handler failed: ${String(err)}`,
          });
        }
      }
    }
    for (const state of this.iterators) state.push(event);
  }

  subscribe(handler: EventHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  iterator(): AsyncIterableIterator<AgentEvent> {
    const state = new IteratorState();
    this.iterators.add(state);
    const cleanup = () => {
      this.iterators.delete(state);
    };
    if (this.closed) state.close();
    return makeAsyncIterator(state, cleanup);
  }

  async drain(): Promise<void> {
    const checks = [...this.iterators];
    for (const state of checks) {
      while (state.length > 0) {
        await new Promise<void>((r) => setTimeout(r, 1));
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const state of this.iterators) state.close();
    this.iterators.clear();
    this.subscribers.clear();
  }
}

class IteratorState {
  queue: AgentEvent[] = [];
  waiters: Waiter[] = [];
  done = false;
  private droppedCount = 0;
  private backpressureActive = false;

  get length(): number {
    return this.queue.length;
  }

  push(event: AgentEvent): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
      this.droppedCount++;
      if (!this.backpressureActive) {
        this.backpressureActive = true;
        // Inject a synthetic warning so consumers know data was lost.
        this.queue.push({
          type: "error",
          message: `Event queue overflow: ${this.droppedCount} events dropped. Consumer is too slow.`,
          reason: "backpressure",
        });
      }
    }
    this.queue.push(event);
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    while (this.waiters.length > 0) {
      const w = this.waiters.shift()!;
      w.resolve({ value: undefined as unknown as AgentEvent, done: true });
    }
  }

  next(): Promise<IteratorResult<AgentEvent>> {
    const event = this.queue.shift();
    if (event !== undefined)
      return Promise.resolve({ value: event, done: false });
    if (this.done)
      return Promise.resolve({
        value: undefined as unknown as AgentEvent,
        done: true,
      });
    return new Promise((resolve) => {
      this.waiters.push({ resolve });
    });
  }
}

function makeAsyncIterator(
  state: IteratorState,
  cleanup: () => void,
): AsyncIterableIterator<AgentEvent> {
  return {
    next: () => state.next(),
    return(value?: unknown): Promise<IteratorResult<AgentEvent>> {
      state.close();
      cleanup();
      return Promise.resolve({ value: value as AgentEvent, done: true });
    },
    throw(err?: unknown): Promise<IteratorResult<AgentEvent>> {
      state.close();
      cleanup();
      return Promise.reject(err);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export function createEventStream(): EventStream {
  return new EventStreamImpl();
}
