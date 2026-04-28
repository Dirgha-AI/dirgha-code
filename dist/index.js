/**
 * Library entrypoint for the v2 core.
 *
 * Re-exports the kernel, providers, and tools so embedders can build
 * their own agents against the same primitives the CLI binary uses.
 */
export * from './kernel/index.js';
export { ProviderRegistry, ProviderError, NvidiaProvider, OpenRouterProvider, OpenAIProvider, AnthropicProvider, GeminiProvider, OllamaProvider, FireworksProvider, routeModel, isKnownProvider, } from './providers/index.js';
export { ToolRegistry, createToolRegistry, createToolExecutor, DefaultPermissionEngine, builtInTools, fsReadTool, fsWriteTool, fsEditTool, fsLsTool, shellTool, searchGrepTool, searchGlobTool, gitTool, unifiedDiff, summariseDiff, } from './tools/index.js';
export { repairJSON } from './utils/json-repair.js';
//# sourceMappingURL=index.js.map