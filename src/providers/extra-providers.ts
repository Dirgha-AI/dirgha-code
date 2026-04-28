/**
 * Additional OpenAI-compatible providers.
 *
 * Each is a one-line spec adapter built on top of `defineOpenAICompatProvider`.
 * Adding a new provider here is a four-line change — once the spec is
 * defined, register it in `index.ts` (factory map) and `dispatch.ts`
 * (routing rule).
 *
 * Coverage matches opencode + community asks (mistral, cohere, cerebras,
 * together, perplexity, xai, groq, zai/glm). All speak `chat/completions`
 * so they reuse the existing wire protocol.
 */

import { defineOpenAICompatProvider } from './define-openai-compat.js';

export const MistralProvider = defineOpenAICompatProvider({
  id: 'mistral',
  defaultBaseUrl: 'https://api.mistral.ai/v1',
  apiKeyEnv: 'MISTRAL_API_KEY',
  modelPrefixToStrip: /^mistral\//,
});

export const CohereProvider = defineOpenAICompatProvider({
  id: 'cohere',
  defaultBaseUrl: 'https://api.cohere.com/compatibility/v1',
  apiKeyEnv: 'COHERE_API_KEY',
  modelPrefixToStrip: /^cohere\//,
});

export const CerebrasProvider = defineOpenAICompatProvider({
  id: 'cerebras',
  defaultBaseUrl: 'https://api.cerebras.ai/v1',
  apiKeyEnv: 'CEREBRAS_API_KEY',
  modelPrefixToStrip: /^cerebras\//,
});

export const TogetherProvider = defineOpenAICompatProvider({
  id: 'together',
  defaultBaseUrl: 'https://api.together.xyz/v1',
  apiKeyEnv: 'TOGETHER_API_KEY',
  // Together uses vendor-prefixed slugs as-is (no strip).
});

export const PerplexityProvider = defineOpenAICompatProvider({
  id: 'perplexity',
  defaultBaseUrl: 'https://api.perplexity.ai',
  apiKeyEnv: 'PERPLEXITY_API_KEY',
  modelPrefixToStrip: /^perplexity\//,
});

export const XaiProvider = defineOpenAICompatProvider({
  id: 'xai',
  defaultBaseUrl: 'https://api.x.ai/v1',
  apiKeyEnv: 'XAI_API_KEY',
  modelPrefixToStrip: /^xai\//,
});

export const GroqProvider = defineOpenAICompatProvider({
  id: 'groq',
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  apiKeyEnv: 'GROQ_API_KEY',
  modelPrefixToStrip: /^groq\//,
});

export const ZaiProvider = defineOpenAICompatProvider({
  id: 'zai',
  defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
  // Z.AI publishes both ZAI_API_KEY and GLM_API_KEY in user docs.
  // The CLI accepts either; ZAI_API_KEY takes precedence per process.env.
  apiKeyEnv: 'ZAI_API_KEY',
  modelPrefixToStrip: /^(z-ai|glm)\//,
});
