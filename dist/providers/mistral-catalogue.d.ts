/**
 * Mistral model catalogue — source of truth for api.mistral.ai.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const MISTRAL_CATALOGUE: ModelDescriptor[];
export declare const MISTRAL_BY_ID: Map<string, ModelDescriptor>;
export declare const MISTRAL_DEFAULT: ModelDescriptor;
export declare const MISTRAL_ACTIVE: ModelDescriptor[];
