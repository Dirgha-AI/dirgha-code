/**
 * Cerebras model catalogue — source of truth for api.cerebras.ai wafer-scale inference.
 * All models are free during the 2025 preview tier (inputPerM: 0, outputPerM: 0).
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const CEREBRAS_CATALOGUE: ModelDescriptor[];
export declare const CEREBRAS_BY_ID: Map<string, ModelDescriptor>;
export declare const CEREBRAS_DEFAULT: ModelDescriptor;
export declare const CEREBRAS_ACTIVE: ModelDescriptor[];
