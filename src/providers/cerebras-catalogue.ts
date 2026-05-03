/**
 * Cerebras model catalogue — source of truth for api.cerebras.ai wafer-scale inference.
 * All models are free during the 2025 preview tier (inputPerM: 0, outputPerM: 0).
 */

import type { ModelDescriptor } from './catalogue.js';
import { makeIndex, defaultModel, activeModels } from './catalogue.js';

export const CEREBRAS_CATALOGUE: ModelDescriptor[] = [
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    family: 'llama',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0,
    outputPerM: 0,
    defaultModel: true,
    tags: ['fast', 'free'],
  },
  {
    id: 'llama-3.1-8b',
    label: 'Llama 3.1 8B',
    family: 'llama',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0,
    outputPerM: 0,
    tags: ['fast', 'free'],
  },
  {
    id: 'qwen-3-32b',
    label: 'Qwen 3 32B',
    family: 'qwen',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'opt-in',
    thinkingParam: null,
    inputPerM: 0,
    outputPerM: 0,
    tags: ['reasoning', 'free'],
  },
];

export const CEREBRAS_BY_ID = makeIndex(CEREBRAS_CATALOGUE);
export const CEREBRAS_DEFAULT = defaultModel(CEREBRAS_CATALOGUE);
export const CEREBRAS_ACTIVE = activeModels(CEREBRAS_CATALOGUE);
