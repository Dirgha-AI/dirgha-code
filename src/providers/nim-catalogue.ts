/**
 * NVIDIA NIM model catalogue — source of truth for all NIM-hosted models.
 *
 * thinkingMode semantics:
 *   "none"       — model has no reasoning/thinking feature
 *   "always-on"  — model always thinks (kimi-k2-thinking)
 *   "default-on" — model thinks by default; we DISABLE it via thinkingParam (kimi-k2.6, qwen3.5)
 *   "opt-in"     — thinking off by default; caller must pass thinkingParam to enable
 */

export interface NimModel {
  id: string;
  label: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  tools: boolean;
  vision: boolean;
  thinkingMode: "none" | "always-on" | "default-on" | "opt-in";
  /** Params to merge into the NIM request body for thinking control.
   *  For "default-on" models this DISABLES thinking (bug workaround).
   *  For "opt-in" models this ENABLES thinking. null = no injection needed. */
  thinkingParam: Record<string, unknown> | null;
  defaultModel?: boolean;
  tags: string[];
  notes?: string;
}

export const NIM_CATALOGUE: NimModel[] = [
  {
    id: "deepseek-ai/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    family: "deepseek",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    tools: true,
    vision: false,
    thinkingMode: "opt-in",
    thinkingParam: { chat_template_kwargs: { thinking: true } },
    defaultModel: true,
    tags: ["agents", "long-context", "reasoning"],
  },
  {
    id: "deepseek-ai/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    family: "deepseek",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    tools: true,
    vision: false,
    thinkingMode: "opt-in",
    thinkingParam: { chat_template_kwargs: { thinking: true } },
    tags: ["fast", "long-context"],
  },
  {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    family: "kimi",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: true,
    thinkingMode: "default-on",
    // disabled by default — known infinite loop bug on NIM
    thinkingParam: { chat_template_kwargs: { thinking: false } },
    tags: ["vision", "multimodal"],
    notes: "thinking disabled by default — known infinite loop bug on NIM",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    family: "kimi",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "always-on",
    thinkingParam: null,
    tags: ["reasoning", "agents"],
    notes: "200+ sequential tool calls verified; suppress traces with include_reasoning: false",
  },
  {
    id: "qwen/qwen3.5-397b-a17b",
    label: "Qwen 3.5 397B",
    family: "qwen",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "default-on",
    // disabled by default — suppress thinking in prod
    thinkingParam: { chat_template_kwargs: { enable_thinking: false } },
    tags: ["reasoning", "swe"],
  },
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    label: "Qwen 3 Coder 480B",
    family: "qwen",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "opt-in",
    thinkingParam: { chat_template_kwargs: { enable_thinking: true } },
    tags: ["coding", "agents"],
  },
  {
    id: "mistralai/mistral-large-3-675b-instruct-2512",
    label: "Mistral Large 3 675B",
    family: "mistral",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "none",
    thinkingParam: null,
    tags: ["agents", "json"],
  },
  {
    id: "minimaxai/minimax-m2.7",
    label: "MiniMax M2.7",
    family: "minimax",
    contextWindow: 200_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "none",
    thinkingParam: null,
    tags: ["fast", "agentic"],
  },
  {
    id: "meta/llama-4-maverick-17b-128e-instruct",
    label: "Llama 4 Maverick",
    family: "llama",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: true,
    thinkingMode: "none",
    thinkingParam: null,
    tags: ["vision", "long-context", "multilingual"],
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B",
    family: "nemotron",
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    tools: true,
    vision: false,
    thinkingMode: "opt-in",
    thinkingParam: null,
    tags: ["reasoning", "rag"],
  },
];

export const NIM_DEFAULT = NIM_CATALOGUE.find((m) => m.defaultModel)!;

export const NIM_BY_ID = new Map(NIM_CATALOGUE.map((m) => [m.id, m]));

/** Model IDs deprecated/removed from NIM — never route to these. */
export const NIM_DEPRECATED = new Set<string>([
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "minimaxai/minimax-m2",
  "deepseek-ai/deepseek-v3.1-terminus",
  "deepseek-ai/deepseek-v3.2",
]);
