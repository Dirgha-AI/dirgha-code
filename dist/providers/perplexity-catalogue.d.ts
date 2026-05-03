/**
 * Perplexity model catalogue — source of truth for api.perplexity.ai Sonar models.
 * Prices in USD per million tokens as of May 2026.
 * Note: Sonar models also include per-search charges (5 USD / 1k searches).
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const PERPLEXITY_CATALOGUE: ModelDescriptor[];
export declare const PERPLEXITY_BY_ID: Map<string, ModelDescriptor>;
export declare const PERPLEXITY_DEFAULT: ModelDescriptor;
export declare const PERPLEXITY_ACTIVE: ModelDescriptor[];
