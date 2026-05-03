/**
 * xAI (Grok) model catalogue — source of truth for api.x.ai.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const XAI_CATALOGUE: ModelDescriptor[];
export declare const XAI_BY_ID: Map<string, ModelDescriptor>;
export declare const XAI_DEFAULT: ModelDescriptor;
export declare const XAI_ACTIVE: ModelDescriptor[];
