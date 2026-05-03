/**
 * Mistral model catalogue — source of truth for api.mistral.ai.
 * Prices in USD per million tokens as of May 2026.
 */
import { makeIndex, defaultModel, activeModels } from './catalogue.js';
export const MISTRAL_CATALOGUE = [
    {
        id: 'mistral-large-latest',
        label: 'Mistral Large',
        family: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 128_000,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 2,
        outputPerM: 6,
        defaultModel: true,
        tags: ['agents'],
    },
    {
        id: 'mistral-medium-3',
        label: 'Mistral Medium 3',
        family: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 128_000,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.40,
        outputPerM: 2,
        tags: ['balanced'],
    },
    {
        id: 'codestral-latest',
        label: 'Codestral',
        family: 'mistral',
        contextWindow: 256_000,
        maxOutputTokens: 256_000,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 0.30,
        outputPerM: 0.90,
        tags: ['coding'],
    },
    {
        id: 'magistral-medium-latest',
        label: 'Magistral Medium',
        family: 'mistral',
        contextWindow: 40_000,
        maxOutputTokens: 40_000,
        tools: true,
        vision: false,
        thinkingMode: 'always-on',
        thinkingParam: null,
        inputPerM: 0.50,
        outputPerM: 1.50,
        tags: ['reasoning'],
    },
];
export const MISTRAL_BY_ID = makeIndex(MISTRAL_CATALOGUE);
export const MISTRAL_DEFAULT = defaultModel(MISTRAL_CATALOGUE);
export const MISTRAL_ACTIVE = activeModels(MISTRAL_CATALOGUE);
//# sourceMappingURL=mistral-catalogue.js.map