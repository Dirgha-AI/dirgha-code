/**
 * DeepSeek native model catalogue — source of truth for api.deepseek.com.
 * Prices in USD per million tokens as of May 2026.
 *
 * Note: deepseek-v4-pro / deepseek-v4-flash are also served via NVIDIA NIM
 * with vendor-prefixed IDs (deepseek-ai/deepseek-v4-pro). The bare IDs
 * here are for the native api.deepseek.com endpoint.
 */

import type { ModelDescriptor } from './catalogue.js';
import { makeIndex, defaultModel, activeModels } from './catalogue.js';

const DEEPSEEK_THINKING_PARAM = { chat_template_kwargs: { thinking: true } };

export const DEEPSEEK_CATALOGUE: ModelDescriptor[] = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat (V3)',
    family: 'deepseek',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: false,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0.27,
    outputPerM: 1.10,
    cachedInputPerM: 0.07,
    defaultModel: true,
    notes: 'aka deepseek-v3; general-purpose flagship',
    tags: ['coding'],
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner (R1)',
    family: 'deepseek',
    contextWindow: 64_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: 'always-on',
    thinkingParam: null,
    inputPerM: 0.55,
    outputPerM: 2.19,
    cachedInputPerM: 0.14,
    notes: 'aka deepseek-r1; chain-of-thought reasoning',
    tags: ['reasoning'],
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    family: 'deepseek',
    contextWindow: 64_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: 'opt-in',
    thinkingParam: DEEPSEEK_THINKING_PARAM,
    inputPerM: 0.27,
    outputPerM: 1.10,
    cachedInputPerM: 0.07,
    tags: ['agents'],
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    family: 'deepseek',
    contextWindow: 64_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: 'opt-in',
    thinkingParam: DEEPSEEK_THINKING_PARAM,
    inputPerM: 0.07,
    outputPerM: 0.28,
    cachedInputPerM: 0.02,
    tags: ['fast'],
  },
];

export const DEEPSEEK_BY_ID = makeIndex(DEEPSEEK_CATALOGUE);
export const DEEPSEEK_DEFAULT = defaultModel(DEEPSEEK_CATALOGUE);
export const DEEPSEEK_ACTIVE = activeModels(DEEPSEEK_CATALOGUE);

/** Set of model IDs served by api.deepseek.com. */
export const DEEPSEEK_MODEL_IDS = new Set(DEEPSEEK_CATALOGUE.map(m => m.id));
