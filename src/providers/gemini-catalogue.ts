/**
 * Google Gemini model catalogue — source of truth for all Gemini-hosted models.
 * Prices in USD per million tokens as of May 2026.
 */

import type { ModelDescriptor } from './catalogue.js';
import { makeIndex, defaultModel, activeModels } from './catalogue.js';

const GEMINI_THINKING_PARAM = {
  generationConfig: { thinkingConfig: { thinkingBudget: 8192 } },
};

export const GEMINI_CATALOGUE: ModelDescriptor[] = [
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    family: 'gemini',
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    tools: true,
    vision: true,
    thinkingMode: 'opt-in',
    thinkingParam: GEMINI_THINKING_PARAM,
    inputPerM: 1.25,
    outputPerM: 10,
    defaultModel: true,
    tags: ['long-context', 'reasoning'],
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    family: 'gemini',
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    tools: true,
    vision: true,
    thinkingMode: 'opt-in',
    thinkingParam: GEMINI_THINKING_PARAM,
    inputPerM: 0.075,
    outputPerM: 0.30,
    tags: ['fast', 'long-context'],
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    family: 'gemini',
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    tools: true,
    vision: true,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0.0375,
    outputPerM: 0.15,
    tags: ['fast'],
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    family: 'gemini',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    tools: true,
    vision: true,
    thinkingMode: 'none',
    thinkingParam: null,
    inputPerM: 0.10,
    outputPerM: 0.40,
    deprecated: true,
    replacedBy: 'gemini-2.5-flash',
    tags: [],
  },
];

export const GEMINI_BY_ID = makeIndex(GEMINI_CATALOGUE);
export const GEMINI_DEFAULT = defaultModel(GEMINI_CATALOGUE);
export const GEMINI_ACTIVE = activeModels(GEMINI_CATALOGUE);
