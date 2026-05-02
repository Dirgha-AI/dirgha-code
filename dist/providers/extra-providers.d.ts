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
export declare const MistralProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const CohereProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const CerebrasProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const TogetherProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const PerplexityProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const XaiProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const GroqProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
export declare const ZaiProvider: new (config?: import("./iface.js").ProviderConfig | undefined) => import("./iface.js").Provider;
