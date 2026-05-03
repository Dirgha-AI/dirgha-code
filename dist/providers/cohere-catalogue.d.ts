/**
 * Cohere model catalogue — source of truth for api.cohere.com Command models.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const COHERE_CATALOGUE: ModelDescriptor[];
export declare const COHERE_BY_ID: Map<string, ModelDescriptor>;
export declare const COHERE_DEFAULT: ModelDescriptor;
export declare const COHERE_ACTIVE: ModelDescriptor[];
