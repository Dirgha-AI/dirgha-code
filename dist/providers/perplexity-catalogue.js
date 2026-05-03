/**
 * Perplexity model catalogue — source of truth for api.perplexity.ai Sonar models.
 * Prices in USD per million tokens as of May 2026.
 * Note: Sonar models also include per-search charges (5 USD / 1k searches).
 */
import { makeIndex, defaultModel, activeModels } from './catalogue.js';
export const PERPLEXITY_CATALOGUE = [
    {
        id: 'sonar-pro',
        label: 'Sonar Pro',
        family: 'sonar',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 3,
        outputPerM: 15,
        defaultModel: true,
        tags: ['search'],
    },
    {
        id: 'sonar',
        label: 'Sonar',
        family: 'sonar',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 1,
        outputPerM: 1,
        tags: ['search', 'fast'],
    },
    {
        id: 'sonar-reasoning-pro',
        label: 'Sonar Reasoning Pro',
        family: 'sonar',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        tools: false,
        vision: false,
        thinkingMode: 'always-on',
        thinkingParam: null,
        inputPerM: 2,
        outputPerM: 8,
        tags: ['reasoning', 'search'],
    },
    {
        id: 'sonar-reasoning',
        label: 'Sonar Reasoning',
        family: 'sonar',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        tools: false,
        vision: false,
        thinkingMode: 'always-on',
        thinkingParam: null,
        inputPerM: 1,
        outputPerM: 5,
        tags: ['reasoning', 'search'],
    },
];
export const PERPLEXITY_BY_ID = makeIndex(PERPLEXITY_CATALOGUE);
export const PERPLEXITY_DEFAULT = defaultModel(PERPLEXITY_CATALOGUE);
export const PERPLEXITY_ACTIVE = activeModels(PERPLEXITY_CATALOGUE);
//# sourceMappingURL=perplexity-catalogue.js.map