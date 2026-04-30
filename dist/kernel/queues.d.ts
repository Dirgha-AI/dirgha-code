/**
 * Steering and follow-up queues for mid-flight agent control.
 *
 * Two queue types with different drain semantics:
 *
 *   - SteeringQueue: drain mode 'all'. Every queued message replaces the
 *     current turn's prompt mid-flight. Used for "stop and do this instead".
 *     When drained, all queued messages are returned and the queue is cleared.
 *
 *   - FollowUpQueue: drain mode 'one-at-a-time'. Each queued message becomes
 *     the next turn after the current one completes. When drained, only one
 *     message is returned (if any), leaving the rest for subsequent drains.
 *
 * Both queues accept `AgentMessage` (user messages to inject into the
 * conversation) and expose the standard queue operations: enqueue, drain,
 * peek, and clear.
 */
import type { AgentMessage } from './types.js';
/**
 * Drain mode determines how many messages are removed on drain.
 *   - 'all': drain removes every queued message.
 *   - 'one': drain removes at most one message.
 */
type DrainMode = 'all' | 'one';
/**
 * Base queue implementation with configurable drain behaviour.
 */
declare class MessageQueue {
    protected readonly messages: AgentMessage[];
    protected readonly mode: DrainMode;
    constructor(mode: DrainMode);
    /**
     * Append a message to the end of the queue.
     */
    enqueue(msg: AgentMessage): void;
    /**
     * Remove and return messages according to the drain mode.
     *
     *   - 'all': returns all messages (or null if empty), clears the queue.
     *   - 'one': returns the oldest message as a single-element array (or null
     *     if empty), removes only that message.
     */
    drain(): AgentMessage[] | null;
    /**
     * Peek at queued messages without removing them.
     *
     *   - 'all': returns all messages (or null if empty).
     *   - 'one': returns the oldest message as a single-element array (or null
     *     if empty).
     */
    peek(): AgentMessage[] | null;
    /**
     * Remove all messages from the queue.
     */
    clear(): void;
    /**
     * Number of messages currently in the queue.
     */
    get length(): number;
}
/**
 * SteeringQueue: drain mode 'all'.
 *
 * Used for mid-flight steering — "stop and do this instead". When drained,
 * all queued messages are returned and the queue is cleared. The agent loop
 * should push these messages into history and continue looping (i.e. not
 * break on end_turn).
 */
export declare class SteeringQueue extends MessageQueue {
    constructor();
}
/**
 * FollowUpQueue: drain mode 'one-at-a-time'.
 *
 * Used for scheduling follow-up turns. Each queued message becomes the next
 * turn after the current one completes. When drained, only one message is
 * returned (if any), leaving the rest for subsequent drains.
 */
export declare class FollowUpQueue extends MessageQueue {
    constructor();
}
export {};
