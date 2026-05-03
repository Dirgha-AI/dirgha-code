/**
 * Groq model catalogue — source of truth for api.groq.com LPU-accelerated inference.
 * Prices in USD per million tokens as of May 2026.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const GROQ_CATALOGUE: ModelDescriptor[];
export declare const GROQ_BY_ID: Map<string, ModelDescriptor>;
export declare const GROQ_DEFAULT: ModelDescriptor;
export declare const GROQ_ACTIVE: ModelDescriptor[];
