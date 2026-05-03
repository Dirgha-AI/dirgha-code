/**
 * Cohere model catalogue — source of truth for api.cohere.com Command models.
 * Prices in USD per million tokens as of May 2026.
 */
import { makeIndex, defaultModel, activeModels } from './catalogue.js';
export const COHERE_CATALOGUE = [
    {
        id: 'command-a-03-2025',
        label: 'Command A (Mar 2025)',
        family: 'cohere',
        contextWindow: 256_000,
        maxOutputTokens: 8_192,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 2.50,
        outputPerM: 10,
        defaultModel: true,
        tags: ['agents'],
    },
    {
        id: 'command-r-plus-08-2024',
        label: 'Command R+ (Aug 2024)',
        family: 'cohere',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 2.50,
        outputPerM: 10,
        tags: [],
    },
    {
        id: 'command-r-08-2024',
        label: 'Command R (Aug 2024)',
        family: 'cohere',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.15,
        outputPerM: 0.60,
        tags: ['fast'],
    },
];
export const COHERE_BY_ID = makeIndex(COHERE_CATALOGUE);
export const COHERE_DEFAULT = defaultModel(COHERE_CATALOGUE);
export const COHERE_ACTIVE = activeModels(COHERE_CATALOGUE);
//# sourceMappingURL=cohere-catalogue.js.map