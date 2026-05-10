import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest } from "./iface.js";
import { streamChatCompletions } from "./openai-compat.js";

/** Configuration entry loaded from ~/.dirgha/providers.json */
export interface CustomProviderEntry {
  id: string;
  label: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  supportsTools?: boolean;
  supportsThinking?: boolean;
  timeoutMs?: number;
  stallTimeoutMs?: number;
}

/** Runtime provider that talks to any OpenAI‑compatible server */
export class CustomProvider implements Provider {
  readonly id: string;
  readonly entry: CustomProviderEntry;

  constructor(entry: CustomProviderEntry) {
    this.entry = entry;
    this.id = entry.id;
  }

  supportsTools(): boolean {
    return this.entry.supportsTools ?? true;
  }

  supportsThinking(): boolean {
    return this.entry.supportsThinking ?? false;
  }

  async *stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    // Escape regex metacharacters in the provider id to avoid injection
    const escapedId = this.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const model = req.model.replace(new RegExp(`^${escapedId}/`), "");

    // Build a safe environment variable name (replace non-alphanumeric with underscore)
    const safeId = this.entry.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const apiKey =
      this.entry.apiKey ??
      process.env[`CUSTOM_${safeId}_API_KEY`] ??
      "";

    const endpoint = `${this.entry.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const timeoutMs = this.entry.timeoutMs ?? 90_000;
    const stallTimeoutMs = this.entry.stallTimeoutMs ?? 90_000;

    yield* streamChatCompletions({
      providerName: this.id,
      endpoint,
      apiKey,
      model,
      messages: req.messages,
      tools: this.supportsTools() ? req.tools : undefined,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      timeoutMs,
      stallTimeoutMs,
      includeThinking: this.supportsThinking(),
    });
  }
}

/**
 * Read the user‑level providers file and instantiate a map of
 * CustomProvider objects.  Failures (file missing, parse error, …)
 * are silently swallowed – an empty Map is returned.
 */
export function loadCustomProviders(): Map<string, CustomProvider> {
  const path = join(homedir(), ".dirgha", "providers.json");
  try {
    const raw = readFileSync(path, { encoding: "utf-8" });
    const entries: CustomProviderEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return new Map();
    const map = new Map<string, CustomProvider>();
    for (const entry of entries) {
      if (entry.id) map.set(entry.id, new CustomProvider(entry));
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Singleton provider map, populated once at module load */
export const CUSTOM_PROVIDERS: Map<string, CustomProvider> =
  loadCustomProviders();
