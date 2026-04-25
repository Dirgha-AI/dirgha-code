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
import { type OpenAICompatSpec } from './define-openai-compat.js';
import type { Provider } from './iface.js';
export declare const OPENAI_PRESET: OpenAICompatSpec;
export declare const OPENROUTER_PRESET: OpenAICompatSpec;
export declare const NVIDIA_PRESET: OpenAICompatSpec;
export declare const FIREWORKS_PRESET: OpenAICompatSpec;
export declare const DEEPSEEK_PRESET: OpenAICompatSpec;
/** Build a provider instance from a preset name + optional overrides. */
export declare function fromPreset(preset: OpenAICompatSpec, overrides?: {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
}): Provider;
/** Registry of named presets so config can reference one by string. */
export declare const PRESETS: Record<string, OpenAICompatSpec>;
