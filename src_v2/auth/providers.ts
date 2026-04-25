/**
 * Provider registry — single source of truth for BYOK metadata.
 *
 * Each entry maps a CLI-friendly provider id (used in
 * `dirgha login --provider=<id>`) to:
 *
 *   - displayName: friendly label for `keys list` / `auth list`
 *   - envVars:     env names checked in priority order. The first
 *                  entry is the "canonical" one used by `keys set`
 *                  and `login --provider=…`. Extra entries match
 *                  the multi-env-name convention so a key set for
 *                  `GH_TOKEN` is also visible to `GITHUB_TOKEN`.
 *   - baseUrl:     default API base. Override env name in
 *                  `baseUrlEnv` for self-hosted endpoints.
 *   - homepage:    where to mint a key
 *   - authType:    'api_key' | 'oauth_external' | 'gateway'
 *
 * 16 providers covered today; adding a new one is a one-record diff.
 * Shape is intentionally compatible with the `models.dev` provider
 * record format so downstream tooling can interop.
 */

export interface ProviderInfo {
  id: string;                  // 'openrouter', 'anthropic', 'cerebras', …
  displayName: string;         // 'OpenRouter', 'Anthropic', …
  envVars: readonly string[];  // first entry is canonical; alts match for free
  baseUrl?: string;
  baseUrlEnv?: string;
  homepage: string;            // for the "where do I get a key" hint
  authType: 'api_key' | 'oauth_external' | 'gateway';
}

export const PROVIDERS: readonly ProviderInfo[] = [
  // Native APIs
  { id: 'anthropic',  displayName: 'Anthropic',         envVars: ['ANTHROPIC_API_KEY'],  baseUrl: 'https://api.anthropic.com',                  homepage: 'https://console.anthropic.com/settings/keys',          authType: 'api_key' },
  { id: 'openai',     displayName: 'OpenAI',            envVars: ['OPENAI_API_KEY'],     baseUrl: 'https://api.openai.com/v1',                   homepage: 'https://platform.openai.com/api-keys',                  authType: 'api_key' },
  { id: 'gemini',     displayName: 'Google Gemini',     envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], baseUrl: 'https://generativelanguage.googleapis.com/v1beta', homepage: 'https://aistudio.google.com/app/apikey',         authType: 'api_key' },

  // Aggregators / gateways
  { id: 'openrouter', displayName: 'OpenRouter',        envVars: ['OPENROUTER_API_KEY'], baseUrl: 'https://openrouter.ai/api/v1',                homepage: 'https://openrouter.ai/keys',                            authType: 'gateway' },
  { id: 'nvidia',     displayName: 'NVIDIA NIM',        envVars: ['NVIDIA_API_KEY'],     baseUrl: 'https://integrate.api.nvidia.com/v1',         homepage: 'https://build.nvidia.com',                              authType: 'api_key' },
  { id: 'fireworks',  displayName: 'Fireworks AI',      envVars: ['FIREWORKS_API_KEY'],  baseUrl: 'https://api.fireworks.ai/inference/v1',       homepage: 'https://fireworks.ai/settings/users/api-keys',         authType: 'api_key' },
  { id: 'deepseek',   displayName: 'DeepSeek',          envVars: ['DEEPSEEK_API_KEY'],   baseUrl: 'https://api.deepseek.com/v1',                 homepage: 'https://platform.deepseek.com/api_keys',                authType: 'api_key' },

  // Inference-only (fast, OpenAI-compat)
  { id: 'groq',        displayName: 'Groq',             envVars: ['GROQ_API_KEY'],       baseUrl: 'https://api.groq.com/openai/v1',              homepage: 'https://console.groq.com/keys',                         authType: 'api_key' },
  { id: 'cerebras',    displayName: 'Cerebras',         envVars: ['CEREBRAS_API_KEY'],   baseUrl: 'https://api.cerebras.ai/v1',                  homepage: 'https://cloud.cerebras.ai/platform/...',                authType: 'api_key' },
  { id: 'together',    displayName: 'Together AI',      envVars: ['TOGETHER_API_KEY'],   baseUrl: 'https://api.together.xyz/v1',                 homepage: 'https://api.together.ai/settings/api-keys',             authType: 'api_key' },
  { id: 'deepinfra',   displayName: 'DeepInfra',        envVars: ['DEEPINFRA_API_KEY'],  baseUrl: 'https://api.deepinfra.com/v1/openai',         homepage: 'https://deepinfra.com/dash/api_keys',                   authType: 'api_key' },

  // Vendor / specialty
  { id: 'mistral',     displayName: 'Mistral',          envVars: ['MISTRAL_API_KEY'],    baseUrl: 'https://api.mistral.ai/v1',                   homepage: 'https://console.mistral.ai/api-keys/',                  authType: 'api_key' },
  { id: 'xai',         displayName: 'xAI',              envVars: ['XAI_API_KEY'],        baseUrl: 'https://api.x.ai/v1',                         homepage: 'https://console.x.ai',                                  authType: 'api_key' },
  { id: 'perplexity',  displayName: 'Perplexity',       envVars: ['PERPLEXITY_API_KEY'], baseUrl: 'https://api.perplexity.ai',                   homepage: 'https://www.perplexity.ai/settings/api',                authType: 'api_key' },
  { id: 'cohere',      displayName: 'Cohere',           envVars: ['COHERE_API_KEY'],     baseUrl: 'https://api.cohere.com/v1',                   homepage: 'https://dashboard.cohere.com/api-keys',                 authType: 'api_key' },

  // Open-weights ecosystem
  { id: 'kimi',        displayName: 'Kimi (Moonshot)',  envVars: ['KIMI_API_KEY'],       baseUrl: 'https://api.moonshot.ai/v1',                  homepage: 'https://platform.moonshot.ai/console/api-keys',         authType: 'api_key' },
  { id: 'zai',         displayName: 'Z.AI / GLM',       envVars: ['ZAI_API_KEY', 'GLM_API_KEY'], baseUrl: 'https://api.z.ai/api/paas/v4',         homepage: 'https://z.ai',                                          authType: 'api_key' },
];

const BY_ID = new Map(PROVIDERS.map(p => [p.id, p]));
const BY_ENV = (() => {
  const m = new Map<string, ProviderInfo>();
  for (const p of PROVIDERS) for (const e of p.envVars) m.set(e, p);
  return m;
})();

export function findProviderById(id: string): ProviderInfo | undefined {
  return BY_ID.get(id.toLowerCase());
}

export function findProviderByEnv(envName: string): ProviderInfo | undefined {
  return BY_ENV.get(envName.toUpperCase());
}

export function listProviders(): readonly ProviderInfo[] {
  return PROVIDERS;
}

export function listEnvVars(): readonly string[] {
  return PROVIDERS.flatMap(p => p.envVars);
}
