/**
 * Anthropic model catalogue — source of truth for all Anthropic-hosted models.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const ANTHROPIC_CATALOGUE: ModelDescriptor[];
export declare const ANTHROPIC_BY_ID: Map<string, ModelDescriptor>;
export declare const ANTHROPIC_DEFAULT: ModelDescriptor;
export declare const ANTHROPIC_ACTIVE: ModelDescriptor[];
