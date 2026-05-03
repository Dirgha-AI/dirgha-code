/**
 * OpenAI model catalogue — source of truth for all OpenAI-hosted models.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const OPENAI_CATALOGUE: ModelDescriptor[];
export declare const OPENAI_BY_ID: Map<string, ModelDescriptor>;
export declare const OPENAI_DEFAULT: ModelDescriptor;
export declare const OPENAI_ACTIVE: ModelDescriptor[];
