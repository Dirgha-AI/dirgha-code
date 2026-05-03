/**
 * Together AI model catalogue — source of truth for api.together.xyz open-source models.
 * Prices in USD per million tokens as of May 2026.
 */

import type { ModelDescriptor } from './catalogue.js';
import { makeIndex, defaultModel, activeModels } from './catalogue.js';

export const TOGETHER_CATALOGUE: ModelDescriptor[] = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    label: 'Llama 3.3 70B Turbo',
    family: 'llama',
    contextWindow: 131_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0.88,
    outputPerM: 0.88,
    defaultModel: true,
    tags: ['fast'],
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    label: 'DeepSeek R1',
    family: 'deepseek',
    contextWindow: 64_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: 'always-on',
    thinkingParam: null,
    inputPerM: 3,
    outputPerM: 7,
    tags: ['reasoning'],
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    label: 'Qwen 2.5 72B Turbo',
    family: 'qwen',
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 1.20,
    outputPerM: 1.20,
    tags: ['coding'],
  },
];

export const TOGETHER_BY_ID = makeIndex(TOGETHER_CATALOGUE);
export const TOGETHER_DEFAULT = defaultModel(TOGETHER_CATALOGUE);
export const TOGETHER_ACTIVE = activeModels(TOGETHER_CATALOGUE);
