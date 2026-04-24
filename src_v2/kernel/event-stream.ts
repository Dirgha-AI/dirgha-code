/**
 * Event stream: pub/sub plus async iteration over kernel events.
 *
 * Producers call emit(). Consumers either subscribe for side-effectful
 * handling or iterate via for-await. Multiple consumers are allowed;
 * each independent iterator receives all events from its subscription
 * onward. Back-pressure is bounded by an internal queue.
 */

import type { AgentEvent } from './types.js';

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

export interface EventStream {
  emit(event: AgentEvent): void;
  subscribe(handler: EventHandler): () => void;
  iterator(): AsyncIterableIterator<AgentEvent>;
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
      void Promise.resolve().then(() => handler(event)).catch(err => {
        this.emit({ type: 'error', message: `event handler failed: ${String(err)}` });
      });
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
    const cleanup = () => { this.iterators.delete(state); };
    if (this.closed) state.close();
    return makeAsyncIterator(state, cleanup);
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

  push(event: AgentEvent): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
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
    if (event !== undefined) return Promise.resolve({ value: event, done: false });
    if (this.done) return Promise.resolve({ value: undefined as unknown as AgentEvent, done: true });
    return new Promise(resolve => { this.waiters.push({ resolve }); });
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
    [Symbol.asyncIterator]() { return this; },
  };
}

export function createEventStream(): EventStream {
  return new EventStreamImpl();
}
