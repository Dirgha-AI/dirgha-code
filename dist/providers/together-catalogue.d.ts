/**
 * Together AI model catalogue — source of truth for api.together.xyz open-source models.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const TOGETHER_CATALOGUE: ModelDescriptor[];
export declare const TOGETHER_BY_ID: Map<string, ModelDescriptor>;
export declare const TOGETHER_DEFAULT: ModelDescriptor;
export declare const TOGETHER_ACTIVE: ModelDescriptor[];
