/**
 * models/types.ts — Unified model library types
 */

export interface ModelCapabilities {
  vision: boolean;
  functionCalling: boolean;
  reasoning: boolean;
  streaming: boolean;
  maxTokens: number;
  contextWindow: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities: ModelCapabilities;
  pricing: {
    inputPer1k: number;
    outputPer1k: number;
  };
  tags: string[];
  fallback?: string[];
  /** Model file size in bytes */
  diskSize?: number;
  /** Direct URL for weights/models */
  downloadUrl?: string;
}

export interface DownloadProgress {
  percentage: number;
  transferred: number;
  total: number;
  speed?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatResponse {
  id: string;
  model: string;
  content: ContentBlock[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence';
}

export interface StreamChunk {
  id: string;
  model: string;
  delta: ContentBlock;
  usage?: { inputTokens?: number; outputTokens?: number };
  stop_reason?: string;
}

export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeys?: string[];
  rotationStrategy?: 'least_used' | 'round_robin' | 'failover';
  timeout?: number;
  retries?: number;
}

export interface UnifiedProvider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncGenerator<StreamChunk>;
  listModels(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}
