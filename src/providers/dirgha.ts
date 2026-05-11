/**
 * Dirgha gateway provider.
 *
 * Uses the device-code auth token from ~/.dirgha/credentials.json to
 * call the Dirgha gateway (api.dirgha.ai) which proxies to OpenRouter.
 * This gives signed-in users access to all 300+ OpenRouter models without
 * managing their own OPENROUTER_API_KEY.
 *
 * Falls back to OPENROUTER_API_KEY env var when no token is found,
 * so BYOK users still work through the same code path.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest, ProviderConfig } from "./iface.js";
import { ProviderError } from "./iface.js";
import { streamChatCompletions } from "./openai-compat.js";

const DEFAULT_API_BASE = "https://api.dirgha.ai";

interface CachedToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
}

function loadToken(): string | null {
  try {
    const credPath = join(homedir(), ".dirgha", "credentials.json");
    if (!existsSync(credPath)) return null;
    const raw = readFileSync(credPath, "utf8");
    const parsed = JSON.parse(raw) as CachedToken;
    if (parsed.token && parsed.token.length > 0) {
      // Check expiry — give 5 min buffer
      const expires = new Date(parsed.expiresAt).getTime();
      if (expires > Date.now() + 300_000) return parsed.token;
    }
  } catch {
    // corrupt or missing — fall through
  }
  return null;
}

export class DirghaProvider implements Provider {
  readonly id = "dirgha";

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig = {}) {
    this.baseUrl =
      config.baseUrl ?? process.env["DIRGHA_API_BASE"] ?? DEFAULT_API_BASE;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  /** Resolve the bearer token: auth token first, then env var. */
  private resolveApiKey(): string {
    const token = loadToken();
    if (token) return token;
    const envKey = process.env["OPENROUTER_API_KEY"] ?? "";
    if (envKey) return envKey;
    throw new ProviderError(
      "No Dirgha auth token or OPENROUTER_API_KEY found. Run `dirgha login` or set your key.",
      this.id,
    );
  }

  supportsTools(_modelId: string): boolean {
    return true; // OpenRouter proxies all tool-supporting models
  }

  supportsThinking(modelId: string): boolean {
    return (
      modelId.startsWith("deepseek-ai/") ||
      modelId.startsWith("anthropic/claude-opus") ||
      /^openai\/o[1-9]/.test(modelId)
    );
  }

  async *stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    const apiKey = this.resolveApiKey();
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

    // Strip dirgha/ prefix before forwarding to the gateway
    const model = req.model.replace(/^dirgha\//, "");

    yield* streamChatCompletions({
      providerName: this.id,
      endpoint,
      apiKey,
      model,
      messages: req.messages,
      tools: req.tools,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      timeoutMs: this.timeoutMs,
      extraHeaders: {
        "HTTP-Referer": "https://dirgha.ai",
        "X-Title": "dirgha-cli",
      },
    });
  }
}
