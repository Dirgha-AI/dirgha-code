/**
 * OpenAI-compatible provider presets.
 *
 * Each preset is a pure data blob that, when fed through
 * `defineOpenAICompatProvider`, yields a working Provider class. This
 * is the user-facing proof that adding a new chat-completions-style
 * provider is configuration, not a new TypeScript class.
 *
 * Existing per-provider classes (`openai.ts`, `openrouter.ts`,
 * `nvidia.ts`, `fireworks.ts`) are kept for backwards compat with any
 * code that imports them by name — but as of this refactor they could
 * be expressed entirely as preset blobs from this file. The two
 * non-OpenAI-compat providers (`anthropic.ts`, `gemini.ts`) speak
 * different wire protocols and are not covered by this factory.
 */
import { defineOpenAICompatProvider } from './define-openai-compat.js';
const OPENAI_REASONING_RX = /^o[1-9](?:-.+)?$/i;
export const OPENAI_PRESET = {
    id: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelPrefixToStrip: /^openai\//,
    supportsTools: m => /^gpt-/.test(m) || OPENAI_REASONING_RX.test(m.replace(/^openai\//, '')),
    supportsThinking: m => OPENAI_REASONING_RX.test(m.replace(/^openai\//, '')),
};
const OPENROUTER_TOOL_RX = [
    /^inclusionai\/ling/, /^anthropic\//, /^openai\//, /^google\/gemini/,
    /^mistralai\//, /^meta-llama\//, /^qwen\//, /^deepseek\//,
    /^moonshotai\//, /^minimaxai?\//, /^z-ai\//, /^tencent\//,
];
export const OPENROUTER_PRESET = {
    id: 'openrouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelPrefixToStrip: /^openrouter\//,
    supportsTools: id => {
        const base = id.replace(/:free$/, '').replace(/^openrouter\//, '');
        return OPENROUTER_TOOL_RX.some(rx => rx.test(base));
    },
    supportsThinking: id => /^deepseek-ai\//.test(id) || /^anthropic\/claude-opus/.test(id) || /^openai\/o[1-9]/.test(id),
    extraHeaders: { 'HTTP-Referer': 'https://dirgha.ai', 'X-Title': 'dirgha-cli' },
};
export const NVIDIA_PRESET = {
    id: 'nvidia',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    defaultTimeoutMs: 300_000, // NIM tail latency on tool-followups + reasoning models can take 2-3 minutes
    supportsTools: id => {
        const known = new Set(['moonshotai/kimi-k2-instruct', 'qwen/qwen3-next-80b-a3b-instruct', 'meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-v4-pro', 'deepseek-ai/deepseek-v4-flash']);
        return known.has(id);
    },
    supportsThinking: id => /^deepseek-ai\//.test(id) || /thinking/.test(id),
    extraBody: (model, thinking) => thinking ? { chat_template_kwargs: { enable_thinking: true } } : undefined,
};
export const FIREWORKS_PRESET = {
    id: 'fireworks',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnv: 'FIREWORKS_API_KEY',
};
export const DEEPSEEK_PRESET = {
    id: 'deepseek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelPrefixToStrip: /^deepseek\//,
    supportsTools: () => true,
};
/** Build a provider instance from a preset name + optional overrides. */
export function fromPreset(preset, overrides = {}) {
    const Ctor = defineOpenAICompatProvider(preset);
    return new Ctor(overrides);
}
/** Registry of named presets so config can reference one by string. */
export const PRESETS = {
    openai: OPENAI_PRESET,
    openrouter: OPENROUTER_PRESET,
    nvidia: NVIDIA_PRESET,
    fireworks: FIREWORKS_PRESET,
    deepseek: DEEPSEEK_PRESET,
};
//# sourceMappingURL=presets.js.map