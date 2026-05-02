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
export declare function createEventStream(): EventStream;
