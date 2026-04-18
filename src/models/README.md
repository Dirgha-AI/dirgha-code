# Dirgha Unified Model Library

## Architecture

The unified model library uses **LiteLLM** as the primary abstraction layer, providing access to 100+ providers through a single OpenAI-compatible interface.

## Design Principles

1. **Single Provider, Many Models**: Use LiteLLM proxy to route to any provider
2. **Model Registry**: Central registry with metadata for all available models
3. **Smart Routing**: Automatic model selection based on task complexity, cost, latency
4. **Credential Pooling**: Support multiple API keys per provider with rotation
5. **Fallback Chains**: Automatic failover between providers

## Provider Support (100+ via LiteLLM)

### Direct Providers (native SDK)
- Anthropic (Claude)
- OpenAI (GPT-4, GPT-3.5)
- Google (Gemini)
- Cohere
- Mistral
- XAI (Grok)

### Via LiteLLM Proxy (100+)
- Fireworks (Kimi, Llama, DeepSeek)
- OpenRouter (200+ models)
- NVIDIA (NIM)
- Groq
- Together AI
- Perplexity
- DeepInfra
- Vercel AI
- Azure OpenAI
- AWS Bedrock
- Vertex AI
- Replicate
- Ollama (local)

### SaaS IDE Providers
- OpenCode Zen - Via OpenRouter or custom API
- GitHub Copilot - Via Copilot API
- Codeium - Via Codeium API

## Usage

```typescript
import { ModelRegistry } from './registry.js';
import { LiteLLMProvider } from './providers/litellm.js';

// Get model info
const model = ModelRegistry.getModel('claude-sonnet-4-5');

// Call through unified interface
const provider = new LiteLLMProvider({ baseUrl: 'http://localhost:4000' });
const response = await provider.chat({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello' }]
});
```
