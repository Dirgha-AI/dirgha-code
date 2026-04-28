/**
 * Event stream: pub/sub plus async iteration over kernel events.
 *
 * Producers call emit(). Consumers either subscribe for side-effectful
 * handling or iterate via for-await. Multiple consumers are allowed;
 * each independent iterator receives all events from its subscription
 * onward. Back-pressure is bounded by an internal queue.
 */
const MAX_QUEUE = 4096;
class EventStreamImpl {
    subscribers = new Set();
    iterators = new Set();
    closed = false;
    emit(event) {
        if (this.closed)
            return;
        for (const handler of this.subscribers) {
            void Promise.resolve().then(() => handler(event)).catch(err => {
                this.emit({ type: 'error', message: `event handler failed: ${String(err)}` });
            });
        }
        for (const state of this.iterators)
            state.push(event);
    }
    subscribe(handler) {
        this.subscribers.add(handler);
        return () => {
            this.subscribers.delete(handler);
        };
    }
    iterator() {
        const state = new IteratorState();
        this.iterators.add(state);
        const cleanup = () => { this.iterators.delete(state); };
        if (this.closed)
            state.close();
        return makeAsyncIterator(state, cleanup);
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const state of this.iterators)
            state.close();
        this.iterators.clear();
        this.subscribers.clear();
    }
}
class IteratorState {
    queue = [];
    waiters = [];
    done = false;
    push(event) {
        if (this.done)
            return;
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter.resolve({ value: event, done: false });
            return;
        }
        if (this.queue.length >= MAX_QUEUE)
            this.queue.shift();
        this.queue.push(event);
    }
    close() {
        if (this.done)
            return;
        this.done = true;
        while (this.waiters.length > 0) {
            const w = this.waiters.shift();
            w.resolve({ value: undefined, done: true });
        }
    }
    next() {
        const event = this.queue.shift();
        if (event !== undefined)
            return Promise.resolve({ value: event, done: false });
        if (this.done)
            return Promise.resolve({ value: undefined, done: true });
        return new Promise(resolve => { this.waiters.push({ resolve }); });
    }
}
function makeAsyncIterator(state, cleanup) {
    return {
        next: () => state.next(),
        return(value) {
            state.close();
            cleanup();
            return Promise.resolve({ value: value, done: true });
        },
        throw(err) {
            state.close();
            cleanup();
            return Promise.reject(err);
        },
        [Symbol.asyncIterator]() { return this; },
    };
}
export function createEventStream() {
    return new EventStreamImpl();
}
//# sourceMappingURL=event-stream.js.map