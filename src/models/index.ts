/**
 * models/index.ts — Unified Model Library exports
 * 
 * This is the main entry point for the Dirgha Unified Model Library.
 * All model interactions should go through this interface.
 */

// Types
export type {
  ModelCapabilities,
  ModelInfo,
  ChatMessage,
  ContentBlock,
  ToolCall,
  ChatRequest,
  ChatResponse,
  ToolDefinition,
  StreamChunk,
  ProviderConfig,
  UnifiedProvider,
} from './types.js';

// Model Registry
export { ModelRegistry, MODEL_REGISTRY } from './registry.js';

// Credential Management
export { CredentialPoolManager, getCredentialPoolManager } from './credential-pool.js';

// Utility re-exports from providers for direct access
export { postJSON, streamJSON } from '../providers/http.js';
