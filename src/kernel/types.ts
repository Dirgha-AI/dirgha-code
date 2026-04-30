/**
 * Canonical message and event types.
 *
 * Every layer above kernel consumes these types. Providers emit events,
 * tools consume tool-use parts and emit tool-result parts, surfaces render
 * events, the daemon streams events over RPC. One shape, everywhere.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ThinkingPart {
  type: 'thinking';
  text: string;
  signature?: string;
}

export interface ToolUsePart {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultPart {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ContentPart = TextPart | ThinkingPart | ToolUsePart | ToolResultPart;

export interface Message {
  role: Role;
  content: string | ContentPart[];
  name?: string;
}

/**
 * UI-only metadata that may be attached to a message in agent state but
 * MUST NOT be sent to the LLM. Use `convertToLlm` (see `./message.ts`) at
 * the provider boundary to strip these fields.
 *
 * `kind` is the high-level provenance / role of the entry:
 *   - 'notification'    : transient UI banner (rate-limit, model-switch, etc.)
 *   - 'skill-injection' : marker for a skill-prompt injection event
 *   - 'fleet-supervisor': supervisor commentary in fleet/multi-agent runs
 *   - 'internal'        : free-form internal annotation
 *
 * `data` is opaque to the kernel; consumers (TUI, daemon, fleet) may shape
 * it as they wish.
 */
export interface AgentMessageUi {
  kind: 'notification' | 'skill-injection' | 'fleet-supervisor' | 'internal';
  data?: unknown;
}

/**
 * `AgentMessage` is the in-kernel transcript entry. It is a `Message` plus
 * optional UI-only metadata. The agent loop stores `AgentMessage[]`; only
 * the projected `Message[]` (via `convertToLlm`) is sent to providers.
 *
 * `hidden: true` excludes the message from the LLM context entirely.
 */
export interface AgentMessage extends Message {
  ui?: AgentMessageUi;
  hidden?: boolean;
}

export type StopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'stop_sequence'
  | 'error'
  | 'aborted';

export interface UsageTotal {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export type AgentEvent =
  | { type: 'agent_start'; sessionId: string; model: string }
  | { type: 'turn_start'; turnId: string; turnIndex: number }
  | { type: 'text_start' }
  | { type: 'text_delta'; delta: string }
  | { type: 'text_end' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_end' }
  | { type: 'toolcall_start'; id: string; name: string }
  | { type: 'toolcall_delta'; id: string; deltaJson: string }
  | { type: 'toolcall_end'; id: string; input: unknown }
  | { type: 'tool_exec_start'; id: string; name: string; input: unknown }
  | { type: 'tool_exec_progress'; id: string; message: string }
  | { type: 'tool_exec_end'; id: string; output: string; isError: boolean; durationMs: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedTokens?: number }
  | { type: 'turn_end'; turnId: string; stopReason: StopReason }
  | { type: 'agent_end'; sessionId: string; stopReason: StopReason; usage: UsageTotal }
  | { type: 'error'; message: string; reason?: string; retryable?: boolean };

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult<T = unknown> {
  content: string;
  data?: T;
  isError: boolean;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface StreamRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}

export interface ImageGenRequest {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
}

export interface ImageGenResult {
  base64: string;
  mimeType: string;
  model: string;
}

export interface Provider {
  readonly id: string;
  supportsTools(modelId: string): boolean;
  supportsThinking(modelId: string): boolean;
  stream(req: StreamRequest): AsyncIterable<AgentEvent>;
  generateImage?(req: ImageGenRequest, signal?: AbortSignal): Promise<ImageGenResult>;
}

export interface ToolExecutor {
  execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult>;
}

export interface ApprovalBus {
  request(req: { id: string; tool: string; summary: string; diff?: string }): Promise<'approve' | 'deny' | 'approve_once' | 'deny_always'>;
  requiresApproval(toolName: string, input: unknown): boolean;
}

export interface ErrorClassifier {
  classify(err: unknown, provider: string, model: string): ClassifiedError;
}

export interface ClassifiedError {
  retryable: boolean;
  backoffMs?: number;
  shouldFallback: boolean;
  reason: string;
}

export interface AgentHooks {
  beforeTurn?: (turnIndex: number, messages: Message[]) => Promise<'continue' | 'abort'>;
  beforeToolCall?: (call: ToolCall) => Promise<{ block: true; reason: string } | { block: false; replaceInput?: unknown } | undefined>;
  afterToolCall?: (call: ToolCall, result: ToolResult) => Promise<ToolResult>;
  afterTurn?: (turnIndex: number, usage: UsageTotal) => Promise<void>;
}

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  [key: string]: unknown;
};

export interface AgentResult {
  messages: Message[];
  usage: UsageTotal;
  stopReason: StopReason;
  turnCount: number;
  sessionId: string;
}
