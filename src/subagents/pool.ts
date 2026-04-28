/**
 * Bounded-concurrency pool for subagent delegations. Delegations beyond
 * the concurrency cap are queued FIFO; the pool never drops requests.
 */

import type { SubagentDelegator, SubagentRequest, SubagentResult } from './delegator.js';

export interface SubagentPoolOptions {
  delegator: SubagentDelegator;
  maxConcurrent?: number;
}

type Resolver = { resolve: (v: SubagentResult) => void; reject: (e: unknown) => void };

export class SubagentPool {
  private inflight = 0;
  private queue: Array<{ req: SubagentRequest; resolver: Resolver }> = [];
  private readonly max: number;

  constructor(private opts: SubagentPoolOptions) {
    this.max = Math.max(1, opts.maxConcurrent ?? 3);
  }

  delegate(req: SubagentRequest): Promise<SubagentResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ req, resolver: { resolve, reject } });
      this.drain();
    });
  }

  private drain(): void {
    while (this.inflight < this.max && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.inflight++;
      this.opts.delegator.delegate(item.req)
        .then(result => item.resolver.resolve(result))
        .catch(err => item.resolver.reject(err))
        .finally(() => { this.inflight--; this.drain(); });
    }
  }
}
