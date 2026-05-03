/**
 * OpenAI model catalogue — source of truth for all OpenAI-hosted models.
 * Prices in USD per million tokens as of May 2026.
 */

import type { ModelDescriptor } from './catalogue.js';
import { makeIndex, defaultModel, activeModels } from './catalogue.js';

export const OPENAI_CATALOGUE: ModelDescriptor[] = [
  {
    id: 'gpt-5',
    label: 'GPT-5',
    family: 'gpt',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tools: true,
    vision: true,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 2.50,
    outputPerM: 10,
    defaultModel: true,
    tags: ['flagship'],
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    family: 'gpt',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tools: true,
    vision: true,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 2.50,
    outputPerM: 10,
    tags: ['vision'],
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    family: 'gpt',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tools: true,
    vision: true,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0.15,
    outputPerM: 0.60,
    tags: ['fast'],
  },
  {
    id: 'o3',
    label: 'o3',
    family: 'gpt',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    tools: true,
    vision: true,
    thinkingMode: 'always-on',
    thinkingParam: null,
    inputPerM: 10,
    outputPerM: 40,
    tags: ['reasoning'],
  },
  {
    id: 'o4-mini',
    label: 'o4-mini',
    family: 'gpt',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    tools: true,
    vision: true,
    thinkingMode: 'always-on',
    thinkingParam: null,
    inputPerM: 1.10,
    outputPerM: 4.40,
    tags: ['reasoning', 'fast'],
  },
];

export const OPENAI_BY_ID = makeIndex(OPENAI_CATALOGUE);
export const OPENAI_DEFAULT = defaultModel(OPENAI_CATALOGUE);
export const OPENAI_ACTIVE = activeModels(OPENAI_CATALOGUE);
