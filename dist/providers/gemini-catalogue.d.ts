/**
 * Google Gemini model catalogue — source of truth for all Gemini-hosted models.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const GEMINI_CATALOGUE: ModelDescriptor[];
export declare const GEMINI_BY_ID: Map<string, ModelDescriptor>;
export declare const GEMINI_DEFAULT: ModelDescriptor;
export declare const GEMINI_ACTIVE: ModelDescriptor[];
