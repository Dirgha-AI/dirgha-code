/**
 * Multimodal tool: a minimal surface for describing images, transcribing
 * audio, and generating images. The tool is shaped as a single entry
 * point (`action: 'describe_image' | 'transcribe_audio' | 'generate_image'`)
 * so the agent only learns one name and the provider plumbing stays
 * internal.
 *
 * Status of the three actions:
 *   - describe_image / transcribe_audio: best-effort. They route through
 *     the active provider's `stream` API with a multimodal payload when
 *     the model advertises support; otherwise they return a clear
 *     "provider lacks multimodal capability" result. They are NOT stubs —
 *     they will do real work on capable providers (Gemini, Claude vision,
 *     OpenAI gpt-4o) — but they can fail politely elsewhere.
 *   - generate_image: real. Routes through the active provider's
 *     optional `generateImage()` method (NVIDIA Flux Schnell by default,
 *     OpenAI DALL-E 3 as fallback when NVIDIA is unavailable and
 *     OPENAI_API_KEY is set). The decoded PNG is written to disk and
 *     the tool returns the absolute path.
 *
 * This file imports two provider classes lazily for fallback construction
 * when the active provider doesn't expose `generateImage`. It does not
 * pull in any streaming/chat-completions internals.
 */
import type { Tool } from './registry.js';
import type { Provider } from '../kernel/types.js';
export interface MultimodalToolOptions {
    /** Active provider, used for describe/transcribe actions. */
    provider: Provider;
    /** Default model id if the caller doesn't pass `model` in the input. */
    defaultModel: string;
    /**
     * Optional narrow capability check — if provided, determines whether
     * the tool attempts a real provider call for describe/transcribe.
     * Defaults to `provider.supportsTools` as a heuristic proxy: any
     * provider that exposes tool use also tends to expose multimodal on
     * its capable models. Callers can override for tighter control.
     */
    supportsMultimodal?: (modelId: string) => boolean;
}
export declare function createMultimodalTool(opts: MultimodalToolOptions): Tool;
