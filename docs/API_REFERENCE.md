# Dirgha CLI - API Reference

Technical reference for developers integrating with or extending Dirgha.

## Table of Contents

1. [Core Types](#core-types)
2. [Agent System](#agent-system)
3. [Provider Interface](#provider-interface)
4. [Tool System](#tool-system)
5. [Session API](#session-api)
6. [Billing API](#billing-api)
7. [Multi-Modal API](#multi-modal-api)
8. [Configuration Schema](#configuration-schema)

---

## Core Types

### Message

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp?: number;
}

type ContentBlock = 
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
```

### ModelResponse

```typescript
interface ModelResponse {
  content: ContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
  stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
}
```

### Tool Definition

```typescript
interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface ToolResult {
  content: string;
  is_error?: boolean;
}
```

---

## Agent System

### Agent Loop

```typescript
import { agentLoop } from './src/agent/loop.js';

const result = await agentLoop({
  messages: [{ role: 'user', content: 'Hello' }],
  context: buildContext({ projectPath: './' }),
  getTools: () => TOOL_DEFINITIONS,
  onToken: (token) => process.stdout.write(token),
  onToolUse: (tool) => console.log(`Tool: ${tool.name}`)
});
```

### Context Building

```typescript
import { buildContext } from './src/agent/moim.js';

const context = buildContext({
  projectPath: '/path/to/project',
  recentMessages: 20,
  includeFiles: ['./src/main.ts'],
  memory: true
});
```

Context includes:
- System prompt (role, capabilities, constraints)
- Recent conversation history
- Project file summaries
- Relevant memories (if enabled)
- Attached files
- Tool descriptions

### Tool Execution

```typescript
import { executeTool, TOOL_DEFINITIONS } from './src/agent/tools.js';

const result = await executeTool({
  name: 'shell',
  input: { command: 'npm test' }
});

console.log(result.content);  // Tool output
console.log(result.is_error); // true if command failed
```

---

## Provider Interface

### Adding a New Provider

```typescript
// src/providers/myprovider.ts
import type { Message, ModelResponse } from '../types.js';

export const name = 'myprovider';

export async function* stream(
  messages: Message[],
  model: string,
  apiKey: string,
  tools?: Tool[]
): AsyncGenerator<Partial<ModelResponse>, ModelResponse, unknown> {
  // Stream implementation
  yield { content: [{ type: 'text', text: 'partial...' }] };
  return { content: [{ type: 'text', text: 'final' }], usage: { input_tokens: 10, output_tokens: 5 } };
}

export function detect(): boolean {
  return process.env.MYPROVIDER_API_KEY !== undefined;
}

export const defaultModel = 'myprovider/gpt-4';
```

### Provider Registry

```typescript
import { callGateway, getAvailableProviders } from './src/providers/index.js';

// List available providers (based on API keys)
const providers = getAvailableProviders();
// ['anthropic', 'openai', 'fireworks']

// Call any provider through unified interface
const response = await callGateway({
  messages,
  model: 'claude-3-5-sonnet-20241022',
  tools,
  stream: true
});
```

### Supported Providers

| Provider | Models | Streaming | Tools | Multi-Modal |
|----------|--------|-----------|-------|-------------|
| Anthropic | Claude 3.5/3/3.5-haiku | ✅ | ✅ | ✅ |
| OpenAI | GPT-4o/4/3.5 | ✅ | ✅ | ✅ |
| Fireworks | Llama 3.1/3.2, Mixtral | ✅ | ✅ | ❌ |
| NVIDIA | Nemotron, Llama | ✅ | ❌ | ❌ |
| OpenRouter | Multiple | ✅ | ✅ | ✅ |
| LiteLLM | Proxy any | ✅ | ✅ | ✅ |

---

## Tool System

### Built-in Tools

| Tool | Description | Input Schema |
|------|-------------|--------------|
| `shell` | Execute shell commands | `{ command: string }` |
| `read_file` | Read file contents | `{ path: string }` |
| `write_file` | Write to file | `{ path: string, content: string }` |
| `list_files` | List directory | `{ path: string, recursive?: boolean }` |
| `search_files` | Search with regex | `{ pattern: string, path: string }` |
| `browser` | Navigate/extract | `{ url: string, action: 'navigate' \| 'extract' \| 'screenshot' }` |
| `memory_store` | Save to memory | `{ key: string, value: string, tags?: string[] }` |
| `memory_search` | Search memory | `{ query: string, limit?: number }` |
| `code` | Python/JS execution | `{ language: 'python' \| 'javascript', code: string }` |

### Custom Tool Registration

```typescript
import { TOOL_DEFINITIONS, registerTool } from './src/agent/tools.js';

registerTool({
  name: 'my_tool',
  description: 'Does something useful',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' }
    },
    required: ['param1']
  },
  handler: async (input) => {
    // Implementation
    return { content: `Result: ${input.param1}` };
  }
});
```

---

## Session API

### Session Management

```typescript
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession
} from './src/session/persistence.js';

// Save current conversation
const sessionId = saveSession({
  context: replContext,
  messages: conversationHistory,
  name: 'my-session'
});

// Load by ID
const session = loadSession('550e8400');

// List all sessions
const sessions = listSessions();
// [{ id, name, createdAt, messageCount, preview }]

// Delete session
deleteSession('550e8400');
```

### Database Schema

```typescript
// SQLite tables
interface SessionRow {
  id: string;           // UUID
  name: string | null;  // Optional name
  created_at: number;   // Unix timestamp
  updated_at: number;
  project_path: string | null;
  metadata: string;     // JSON
}

interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  token_count: number;
}

interface AttachmentRow {
  id: string;
  session_id: string;
  type: 'image' | 'file' | 'pdf';
  path: string;
  size: number;
  hash: string;         // SHA-256 for deduplication
  content: string | null; // Extracted text or base64 preview
}
```

---

## Billing API

### Token Usage Tracking

```typescript
import { recordUsage, getUsageSummary } from './src/billing/db.js';

// Record usage from LLM response
recordUsage({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  inputTokens: 1500,
  outputTokens: 800,
  toolCalls: 2,
  sessionId: '550e8400'
});

// Get usage summary
const summary = getUsageSummary({
  since: Date.now() - 24 * 60 * 60 * 1000, // Last 24h
  groupBy: 'model'
});
// { 'claude-3-5-sonnet': { requests: 10, inputTokens: 15000, outputTokens: 8000 } }
```

### Rate Limiting

```typescript
import { checkRateLimit, recordRequest } from './src/billing/ratelimit.js';

// Check before making request
const status = checkRateLimit({
  tier: 'pro',           // 'free' | 'pro' | 'team' | 'enterprise'
  windowMinutes: 60
});

if (!status.allowed) {
  console.log(`Rate limited. Retry after ${status.retryAfterSeconds}s`);
  console.log(`Usage: ${status.requestsInWindow}/${status.limit}`);
}

// Record after successful request
recordRequest({ tier: 'pro' });
```

### Tier Limits

```typescript
const RATE_LIMITS = {
  free: { requestsPerHour: 20, maxInputTokens: 4000, maxContextTokens: 8192 },
  pro: { requestsPerHour: 200, maxInputTokens: 16000, maxContextTokens: 32768 },
  team: { requestsPerHour: 500, maxInputTokens: 32000, maxContextTokens: 128000 },
  enterprise: { requestsPerHour: Infinity, maxInputTokens: Infinity, maxContextTokens: 200000 }
};
```

---

## Multi-Modal API

### Image Attachments

```typescript
import { attachImage } from './src/multimodal/attachments.js';

const attachment = await attachImage({
  path: './screenshot.png',
  sessionId: '550e8400',
  compress: true,        // Compress if >1MB
  maxDimension: 2000     // Resize if larger
});

// Returns: { id, type: 'image', mimeType, size, hash, base64Data }
```

### File Attachments

```typescript
import { attachFile } from './src/multimodal/attachments.js';

const attachment = await attachFile({
  path: './data.csv',
  sessionId: '550e8400',
  extractText: true      // For PDFs, extract text content
});

// Returns: { id, type: 'file', mimeType, size, content: string }
```

### Browser Automation

```typescript
import { browsePage, takeScreenshot } from './src/tools/browser.js';

// Navigate and extract
const page = await browsePage({
  url: 'https://example.com',
  action: 'extract',    // 'navigate' | 'extract' | 'screenshot'
  waitFor: 'networkidle'
});

// Content added to session context automatically
console.log(page.title);
console.log(page.content); // Extracted text

// Screenshot
const screenshot = await takeScreenshot({
  url: 'https://example.com',
  fullPage: true
});
// Returns: { path, base64, width, height }
```

---

## Configuration Schema

### Config Interface

```typescript
interface DirghaConfig {
  version: string;
  defaultProvider: 'anthropic' | 'openai' | 'fireworks' | 'openrouter' | 'litellm';
  
  providers: {
    [key: string]: {
      apiKey: string;
      defaultModel: string;
      timeout?: number;      // ms, default 60000
      baseUrl?: string;      // For custom endpoints
    }
  };
  
  permissions: {
    shell: 'ask' | 'always' | 'never';
    fileRead: 'ask' | 'always' | 'never';
    fileWrite: 'ask' | 'always' | 'never';
    browser: 'ask' | 'always' | 'never';
    network: 'ask' | 'always' | 'never';
  };
  
  context: {
    maxRecentMessages: number;      // Default 20
    maxFileContext: number;         // Default 10000 chars
    autoIndexFiles: boolean;        // Auto-index project files
  };
  
  ui: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
    showTokenCount: boolean;
  };
  
  billing?: {
    tier: 'free' | 'pro' | 'team' | 'enterprise';
    stripeCustomerId?: string;
  };
}
```

### Environment Variables

| Variable | Description | Override |
|----------|-------------|----------|
| `DIRGHA_*_API_KEY` | Provider API keys | `providers.*.apiKey` |
| `DIRGHA_DEFAULT_PROVIDER` | Default provider name | `defaultProvider` |
| `DIRGHA_THEME` | UI theme | `ui.theme` |
| `DIRGHA_SHELL_PERMISSION` | Shell permission | `permissions.shell` |
| `DIRGHA_DEBUG` | Enable debug logging | - |

---

## Error Handling

### Error Types

```typescript
class DirghaError extends Error {
  code: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}

class RateLimitError extends DirghaError {
  code = 'RATE_LIMITED';
  retryable = true;
  retryAfterSeconds: number;
}

class PermissionError extends DirghaError {
  code = 'PERMISSION_DENIED';
  retryable = false;
  toolName: string;
}

class ProviderError extends DirghaError {
  code = 'PROVIDER_ERROR';
  retryable = true;
  provider: string;
  statusCode?: number;
}
```

### Usage Example

```typescript
import { agentLoop } from './src/agent/loop.js';

try {
  const result = await agentLoop(params);
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    console.log(`Rate limited. Wait ${error.retryAfterSeconds}s`);
  } else if (error.code === 'PERMISSION_DENIED') {
    console.log(`Permission denied for: ${error.toolName}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Testing

### Unit Testing Tools

```typescript
import { describe, it, expect } from 'vitest';
import { executeTool } from './src/agent/tools.js';

describe('shell tool', () => {
  it('executes safe commands', async () => {
    const result = await executeTool({
      name: 'shell',
      input: { command: 'echo hello' }
    });
    expect(result.content).toContain('hello');
    expect(result.is_error).toBe(false);
  });
});
```

### Mocking Providers

```typescript
import { vi } from 'vitest';

vi.mock('./src/providers/index.js', () => ({
  callGateway: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'mock response' }]
  })
}));
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process
- Testing requirements
