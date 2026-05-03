/**
 * Groq model catalogue — source of truth for api.groq.com LPU-accelerated inference.
 * Prices in USD per million tokens as of May 2026.
 */
import { makeIndex, defaultModel, activeModels } from './catalogue.js';
export const GROQ_CATALOGUE = [
    {
        id: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 70B Versatile',
        family: 'llama',
        contextWindow: 128_000,
        maxOutputTokens: 32_768,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.59,
        outputPerM: 0.79,
        defaultModel: true,
        tags: ['fast'],
    },
    {
        id: 'llama-3.1-8b-instant',
        label: 'Llama 3.1 8B Instant',
        family: 'llama',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.05,
        outputPerM: 0.08,
        tags: ['fast'],
    },
    {
        id: 'mixtral-8x7b-32768',
        label: 'Mixtral 8x7B',
        family: 'mixtral',
        contextWindow: 32_768,
        maxOutputTokens: 32_768,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.24,
        outputPerM: 0.24,
        tags: [],
    },
    {
        id: 'gemma2-9b-it',
        label: 'Gemma 2 9B IT',
        family: 'gemma',
        contextWindow: 8_192,
        maxOutputTokens: 8_192,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.20,
        outputPerM: 0.20,
        tags: [],
    },
    {
        id: 'qwen-qwq-32b',
        label: 'Qwen QwQ 32B',
        family: 'qwen',
        contextWindow: 128_000,
        maxOutputTokens: 32_768,
        tools: true,
        vision: false,
        thinkingMode: 'always-on',
        thinkingParam: null,
        inputPerM: 0.29,
        outputPerM: 0.39,
        tags: ['reasoning'],
    },
];
export const GROQ_BY_ID = makeIndex(GROQ_CATALOGUE);
export const GROQ_DEFAULT = defaultModel(GROQ_CATALOGUE);
export const GROQ_ACTIVE = activeModels(GROQ_CATALOGUE);
//# sourceMappingURL=groq-catalogue.js.map