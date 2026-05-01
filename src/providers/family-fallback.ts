/**
 * Model family-aware fallback — ported from monorepo agent/model-fallback.ts.
 *
 * When a model from provider A fails, try the same model family
 * on another provider before generic cross-provider fallback.
 */
import type { ProviderId } from "./dispatch.js";

// Model families: maps canonical family name to alternate provider/model pairs
const FAMILIES: Record<
  string,
  Array<{ provider: ProviderId; model: string }>
> = {
  claude: [
    { provider: "openrouter", model: "anthropic/claude-sonnet-4-6" },
    { provider: "openrouter", model: "anthropic/claude-haiku-4-5" },
  ],
  gpt: [
    { provider: "openrouter", model: "openai/gpt-5.4" },
    { provider: "openrouter", model: "openai/gpt-5.4-mini" },
  ],
  gemini: [
    { provider: "openrouter", model: "google/gemini-3.1-pro-preview" },
    { provider: "openrouter", model: "google/gemini-3.1-flash-lite-preview" },
  ],
  llama: [
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "openrouter", model: "meta-llama/llama-4-maverick" },
  ],
  deepseek: [
    { provider: "deepseek", model: "deepseek-chat" },
    { provider: "openrouter", model: "deepseek/deepseek-v3.2" },
    { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
  ],
  kimi: [
    { provider: "nvidia", model: "moonshotai/kimi-k2-instruct" },
    { provider: "openrouter", model: "moonshotai/kimi-k2.6" },
    { provider: "openrouter", model: "moonshotai/kimi-k2.5" },
  ],
  qwen: [
    { provider: "nvidia", model: "qwen/qwen3-coder-480b-a35b-instruct" },
    { provider: "openrouter", model: "qwen/qwen3-coder" },
    { provider: "openrouter", model: "qwen/qwen3.5-plus-20260420" },
  ],
  minimax: [
    { provider: "nvidia", model: "minimaxai/minimax-m2.7" },
    { provider: "openrouter", model: "minimax/minimax-m2.7" },
    { provider: "openrouter", model: "minimax/minimax-m2.5" },
  ],
  mistral: [
    { provider: "mistral", model: "mistral-large-2" },
    { provider: "openrouter", model: "mistralai/mistral-large-2512" },
    { provider: "openrouter", model: "mistralai/mistral-small-2603" },
  ],
};

const FAMILY_PATTERNS: Array<{
  family: string;
  test: (id: string) => boolean;
}> = [
  { family: "claude", test: (id) => id.includes("claude") },
  { family: "gpt", test: (id) => /gpt|o[1-9]|openai/.test(id) },
  { family: "gemini", test: (id) => id.includes("gemini") },
  { family: "llama", test: (id) => id.includes("llama") },
  { family: "deepseek", test: (id) => id.includes("deepseek") },
  {
    family: "kimi",
    test: (id) => id.includes("kimi") || id.includes("moonshotai"),
  },
  { family: "qwen", test: (id) => id.includes("qwen") },
  { family: "minimax", test: (id) => id.includes("minimax") },
  { family: "mistral", test: (id) => id.includes("mistral") },
];

export function detectFamily(modelId: string): string | null {
  for (const { family, test } of FAMILY_PATTERNS) {
    if (test(modelId)) return family;
  }
  return null;
}

export function familyAlternatives(
  modelId: string,
  excludeProvider?: ProviderId,
): Array<{ provider: ProviderId; model: string }> {
  const family = detectFamily(modelId);
  if (!family || !FAMILIES[family]) return [];
  return FAMILIES[family].filter((a) => a.provider !== excludeProvider);
}
