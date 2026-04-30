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
/**
 * Base queue implementation with configurable drain behaviour.
 */
class MessageQueue {
    messages = [];
    mode;
    constructor(mode) {
        this.mode = mode;
    }
    /**
     * Append a message to the end of the queue.
     */
    enqueue(msg) {
        this.messages.push(msg);
    }
    /**
     * Remove and return messages according to the drain mode.
     *
     *   - 'all': returns all messages (or null if empty), clears the queue.
     *   - 'one': returns the oldest message as a single-element array (or null
     *     if empty), removes only that message.
     */
    drain() {
        if (this.messages.length === 0)
            return null;
        if (this.mode === 'all') {
            const drained = [...this.messages];
            this.messages.length = 0;
            return drained;
        }
        // mode === 'one'
        return [this.messages.shift()];
    }
    /**
     * Peek at queued messages without removing them.
     *
     *   - 'all': returns all messages (or null if empty).
     *   - 'one': returns the oldest message as a single-element array (or null
     *     if empty).
     */
    peek() {
        if (this.messages.length === 0)
            return null;
        if (this.mode === 'all') {
            return [...this.messages];
        }
        // mode === 'one'
        return [this.messages[0]];
    }
    /**
     * Remove all messages from the queue.
     */
    clear() {
        this.messages.length = 0;
    }
    /**
     * Number of messages currently in the queue.
     */
    get length() {
        return this.messages.length;
    }
}
/**
 * SteeringQueue: drain mode 'all'.
 *
 * Used for mid-flight steering — "stop and do this instead". When drained,
 * all queued messages are returned and the queue is cleared. The agent loop
 * should push these messages into history and continue looping (i.e. not
 * break on end_turn).
 */
export class SteeringQueue extends MessageQueue {
    constructor() {
        super('all');
    }
}
/**
 * FollowUpQueue: drain mode 'one-at-a-time'.
 *
 * Used for scheduling follow-up turns. Each queued message becomes the next
 * turn after the current one completes. When drained, only one message is
 * returned (if any), leaving the rest for subsequent drains.
 */
export class FollowUpQueue extends MessageQueue {
    constructor() {
        super('one');
    }
}
//# sourceMappingURL=queues.js.map