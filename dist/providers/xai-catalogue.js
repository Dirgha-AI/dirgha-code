/**
 * xAI (Grok) model catalogue — source of truth for api.x.ai.
 * Prices in USD per million tokens as of May 2026.
 */
import { makeIndex, defaultModel, activeModels } from './catalogue.js';
export const XAI_CATALOGUE = [
    {
        id: 'grok-3',
        label: 'Grok 3',
        family: 'grok',
        contextWindow: 131_000,
        maxOutputTokens: 131_000,
        tools: true,
        vision: false,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 3,
        outputPerM: 15,
        defaultModel: true,
        tags: ['flagship'],
    },
    {
        id: 'grok-3-mini',
        label: 'Grok 3 Mini',
        family: 'grok',
        contextWindow: 131_000,
        maxOutputTokens: 131_000,
        tools: true,
        vision: false,
        thinkingMode: 'opt-in',
        thinkingParam: { reasoning_effort: 'high' },
        inputPerM: 0.30,
        outputPerM: 0.50,
        tags: ['reasoning', 'fast'],
    },
    {
        id: 'grok-2-vision-1212',
        label: 'Grok 2 Vision',
        family: 'grok',
        contextWindow: 32_768,
        maxOutputTokens: 32_768,
        tools: true,
        vision: true,
        thinkingMode: 'none',
        thinkingParam: null,
        inputPerM: 2,
        outputPerM: 10,
        tags: ['vision'],
    },
];
export const XAI_BY_ID = makeIndex(XAI_CATALOGUE);
export const XAI_DEFAULT = defaultModel(XAI_CATALOGUE);
export const XAI_ACTIVE = activeModels(XAI_CATALOGUE);
//# sourceMappingURL=xai-catalogue.js.map