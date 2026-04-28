/**
 * Bounded-concurrency pool for subagent delegations. Delegations beyond
 * the concurrency cap are queued FIFO; the pool never drops requests.
 */
export class SubagentPool {
    opts;
    inflight = 0;
    queue = [];
    max;
    constructor(opts) {
        this.opts = opts;
        this.max = Math.max(1, opts.maxConcurrent ?? 3);
    }
    delegate(req) {
        return new Promise((resolve, reject) => {
            this.queue.push({ req, resolver: { resolve, reject } });
            this.drain();
        });
    }
    drain() {
        while (this.inflight < this.max && this.queue.length > 0) {
            const item = this.queue.shift();
            this.inflight++;
            this.opts.delegator.delegate(item.req)
                .then(result => item.resolver.resolve(result))
                .catch(err => item.resolver.reject(err))
                .finally(() => { this.inflight--; this.drain(); });
        }
    }
}
//# sourceMappingURL=pool.js.map