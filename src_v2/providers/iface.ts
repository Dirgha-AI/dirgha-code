/**
 * Provider runtime types. The Provider contract lives in kernel/types.ts
 * (all layers need it). This module adds the runtime-only pieces:
 * configuration objects and the typed error class.
 */

export type {
  Provider,
  StreamRequest,
  ImageGenRequest,
  ImageGenResult,
} from '../kernel/types.js';

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
