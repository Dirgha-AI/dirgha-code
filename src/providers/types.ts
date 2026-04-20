export type Provider =
  | 'anthropic'
  | 'openai'
  | 'fireworks'
  | 'openrouter'
  | 'nvidia'
  | 'gemini'
  | 'groq'
  | 'mistral'
  | 'cohere'
  | 'deepinfra'
  | 'perplexity'
  | 'togetherai'
  | 'xai'
  | 'ollama'
  | 'gateway';

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface CompletionRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface CompletionResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type SSEResult =
  | null
  | { text: string | null; toolCall: { id: string; name: string; args: string } | null };
