/**
 * Provider runtime types. The Provider contract lives in kernel/types.ts
 * (all layers need it). This module adds the runtime-only pieces:
 * configuration objects and the typed error class.
 */
export class ProviderError extends Error {
    provider;
    status;
    retryable;
    constructor(message, provider, status, retryable = false) {
        super(message);
        this.provider = provider;
        this.status = status;
        this.retryable = retryable;
        this.name = 'ProviderError';
    }
}
//# sourceMappingURL=iface.js.map