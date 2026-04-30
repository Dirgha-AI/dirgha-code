/**
 * Shared OpenAI-compatible /chat/completions streaming adapter.
 *
 * Most providers (NIM, OpenRouter, OpenAI, local model runners) speak the
 * same SSE wire format: a stream of `data: {...}` lines carrying chat
 * completion deltas, terminated by `data: [DONE]`. This file parses that
 * stream into canonical AgentEvents. All provider adapters that speak the
 * OpenAI-compatible dialect use this helper; they differ only in base
 * URL, model roster, and per-model request shaping.
 */

import type {
  AgentEvent,
  Message,
  ContentPart,
  ToolDefinition,
} from "../kernel/types.js";
import { streamSSE } from "./http.js";
import { ProviderError } from "./iface.js";
import { repairJSON } from "../utils/json-repair.js";

export interface OpenAICompatCallOptions {
  providerName: string;
  endpoint: string;
  apiKey: string;
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  toolChoice?: "auto" | "required" | "none";
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  sanitizeToolDescriptions?: (desc: string) => string;
  includeThinking?: boolean;
}

export async function* streamChatCompletions(
  opts: OpenAICompatCallOptions,
): AsyncIterable<AgentEvent> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: toOpenAIMessages(opts.messages),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = toOpenAITools(opts.tools, opts.sanitizeToolDescriptions);
    if (opts.toolChoice && opts.toolChoice !== "auto")
      body.tool_choice = opts.toolChoice;
  }
  if (opts.extraBody) Object.assign(body, opts.extraBody);

  const state = new StreamState(opts.includeThinking ?? false);

  for await (const payload of streamSSE({
    providerName: opts.providerName,
    url: opts.endpoint,
    apiKey: opts.apiKey,
    body,
    extraHeaders: opts.extraHeaders,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  })) {
    if (payload === "[DONE]") break;
    let chunk: ChatCompletionChunk;
    try {
      chunk = JSON.parse(payload) as ChatCompletionChunk;
    } catch {
      const repaired = repairJSON(payload) as ChatCompletionChunk;
      if (!repaired || !repaired.choices) continue;
      chunk = repaired;
    }
    yield* state.ingest(chunk);
  }
  yield* state.finalise();
}

function toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") continue;
    if (typeof msg.content === "string") {
      out.push({
        role: msg.role === "assistant" ? "assistant" : msg.role,
        content: msg.content,
      });
      continue;
    }
    const parts = msg.content;
    if (msg.role === "assistant") {
      const texts: string[] = [];
      const thinkings: string[] = [];
      const toolCalls: OpenAIAssistantToolCall[] = [];
      for (const p of parts) {
        if (p.type === "text") texts.push(p.text);
        else if (p.type === "thinking") thinkings.push(p.text);
        else if (p.type === "tool_use") {
          toolCalls.push({
            id: p.id,
            type: "function",
            function: {
              name: p.name,
              arguments: JSON.stringify(p.input ?? {}),
            },
          });
        }
      }
      const assistantMsg: OpenAIMessage = {
        role: "assistant",
        content: texts.length > 0 ? texts.join("") : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        // DeepSeek / OpenAI-compat thinking models require reasoning_content
        // to be echoed back verbatim in multi-turn — omitting it causes 400.
        ...(thinkings.length > 0
          ? { reasoning_content: thinkings.join("") }
          : {}),
      };
      out.push(assistantMsg);
      continue;
    }
    const results: ContentPart[] = parts.filter(
      (p) => p.type === "tool_result",
    );
    const texts: string[] = parts
      .filter(
        (p): p is Extract<ContentPart, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text);
    if (texts.length > 0)
      out.push({
        role: msg.role === "system" ? "system" : "user",
        content: texts.join(""),
      });
    for (const r of results) {
      if (r.type !== "tool_result") continue;
      out.push({
        role: "tool",
        tool_call_id: r.toolUseId,
        content: r.content,
      });
    }
  }
  return out;
}

function toOpenAITools(
  tools: ToolDefinition[],
  sanitize?: (desc: string) => string,
): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: sanitize ? sanitize(t.description) : t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

class StreamState {
  private textOpen = false;
  private thinkingOpen = false;
  private toolOpen = new Map<string, { name: string; bufferedJson: string }>();
  private toolIndexToId = new Map<number, string>();
  private usageEmitted = false;
  // Buffer for inline <think>...</think> blocks that split across
  // chunks. Once we see the open tag, accumulate until the close tag
  // arrives. Anything before/after is text.
  private inThinkBlock = false;
  private thinkBuffer = "";
  private static readonly THINK_OPEN_RE =
    /<(?:think|thinking|reasoning|thought|REASONING_SCRATCHPAD)>/i;
  private static readonly THINK_CLOSE_RE =
    /<\/(?:think|thinking|reasoning|thought|REASONING_SCRATCHPAD)>/i;

  /** Split a content delta into text + thinking pieces, honoring open <think> blocks across chunks. */
  private routeContent(input: string): { text: string; thinking: string } {
    let text = "";
    let thinking = "";
    let s = input;
    while (s.length > 0) {
      if (this.inThinkBlock) {
        const close = s.match(StreamState.THINK_CLOSE_RE);
        if (!close || close.index === undefined) {
          thinking += s;
          this.thinkBuffer += s;
          s = "";
          break;
        }
        thinking += s.slice(0, close.index);
        this.thinkBuffer = "";
        this.inThinkBlock = false;
        s = s.slice(close.index + close[0].length);
      } else {
        const open = s.match(StreamState.THINK_OPEN_RE);
        if (!open || open.index === undefined) {
          text += s;
          s = "";
          break;
        }
        text += s.slice(0, open.index);
        this.inThinkBlock = true;
        s = s.slice(open.index + open[0].length);
      }
    }
    return { text, thinking };
  }

  constructor(private includeThinking: boolean) {}

  *ingest(chunk: ChatCompletionChunk): Generator<AgentEvent> {
    const choice = chunk.choices?.[0];
    if (!choice) {
      yield* this.maybeEmitUsage(chunk);
      return;
    }
    const delta = choice.delta ?? {};

    // Reasoning channel: DeepSeek's native API uses `reasoning_content`,
    // NVIDIA NIM's hosted DeepSeek-V4 uses `reasoning`. Accept both.
    // Without this fallback, NIM's flash variant emits all its output on
    // the `reasoning` channel and dirgha sees zero text → empty reply.
    if (this.includeThinking) {
      const d = delta as { reasoning_content?: string; reasoning?: string };
      const r =
        (typeof d.reasoning_content === "string" && d.reasoning_content) ||
        (typeof d.reasoning === "string" && d.reasoning) ||
        "";
      if (r.length > 0) {
        if (!this.thinkingOpen) {
          yield { type: "thinking_start" };
          this.thinkingOpen = true;
        }
        yield { type: "thinking_delta", delta: r };
      }
    }

    if (typeof delta.content === "string" && delta.content.length > 0) {
      const routed = this.routeContent(delta.content);
      if (routed.text.length > 0) {
        if (this.thinkingOpen) {
          yield { type: "thinking_end" };
          this.thinkingOpen = false;
        }
        if (!this.textOpen) {
          yield { type: "text_start" };
          this.textOpen = true;
        }
        yield { type: "text_delta", delta: routed.text };
      }
      if (routed.thinking.length > 0) {
        if (this.textOpen) {
          yield { type: "text_end" };
          this.textOpen = false;
        }
        if (!this.thinkingOpen) {
          yield { type: "thinking_start" };
          this.thinkingOpen = true;
        }
        yield { type: "thinking_delta", delta: routed.thinking };
      }
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        let id = this.toolIndexToId.get(index);
        if (tc.id && tc.id.length > 0) {
          id = tc.id;
          this.toolIndexToId.set(index, id);
        }
        if (!id) continue;
        let entry = this.toolOpen.get(id);
        if (!entry) {
          const name = tc.function?.name ?? "";
          entry = { name, bufferedJson: "" };
          this.toolOpen.set(id, entry);
          if (this.textOpen) {
            yield { type: "text_end" };
            this.textOpen = false;
          }
          if (this.thinkingOpen) {
            yield { type: "thinking_end" };
            this.thinkingOpen = false;
          }
          yield { type: "toolcall_start", id, name };
        } else if (!entry.name && tc.function?.name) {
          entry.name = tc.function.name;
        }
        const argsDelta = tc.function?.arguments ?? "";
        if (argsDelta.length > 0) {
          entry.bufferedJson += argsDelta;
          yield { type: "toolcall_delta", id, deltaJson: argsDelta };
        }
      }
    }

    if (choice.finish_reason) {
      yield* this.closeOpen();
    }
    yield* this.maybeEmitUsage(chunk);
  }

  *finalise(): Generator<AgentEvent> {
    yield* this.closeOpen();
  }

  private *closeOpen(): Generator<AgentEvent> {
    if (this.textOpen) {
      yield { type: "text_end" };
      this.textOpen = false;
    }
    if (this.thinkingOpen) {
      yield { type: "thinking_end" };
      this.thinkingOpen = false;
    }
    for (const [id, entry] of this.toolOpen) {
      const input = parseArguments(entry.bufferedJson);
      yield { type: "toolcall_end", id, input };
    }
    this.toolOpen.clear();
  }

  private *maybeEmitUsage(chunk: ChatCompletionChunk): Generator<AgentEvent> {
    if (this.usageEmitted) return;
    const usage = chunk.usage;
    if (!usage) return;
    this.usageEmitted = true;
    yield {
      type: "usage",
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    };
  }
}

function parseArguments(json: string): unknown {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return repairJSON(json);
  }
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: OpenAIDeltaToolCall[];
      [key: string]: unknown;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

interface OpenAIDeltaToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIAssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIAssistantToolCall[];
  reasoning_content?: string;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

void ProviderError;
