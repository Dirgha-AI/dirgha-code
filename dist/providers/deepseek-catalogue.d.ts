/**
 * DeepSeek native model catalogue — source of truth for api.deepseek.com.
 * Prices in USD per million tokens as of May 2026.
 *
 * Note: deepseek-v4-pro / deepseek-v4-flash are also served via NVIDIA NIM
 * with vendor-prefixed IDs (deepseek-ai/deepseek-v4-pro). The bare IDs
 * here are for the native api.deepseek.com endpoint.
 */
import type { ModelDescriptor } from './catalogue.js';
export declare const DEEPSEEK_CATALOGUE: ModelDescriptor[];
export declare const DEEPSEEK_BY_ID: Map<string, ModelDescriptor>;
export declare const DEEPSEEK_DEFAULT: ModelDescriptor;
export declare const DEEPSEEK_ACTIVE: ModelDescriptor[];
/** Set of model IDs served by api.deepseek.com. */
export declare const DEEPSEEK_MODEL_IDS: Set<string>;
