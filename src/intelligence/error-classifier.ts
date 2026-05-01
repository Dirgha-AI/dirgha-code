/**
 * Error classifier. Maps any provider error into a structured
 * ClassifiedError with actionable recovery hints. The agent loop and
 * retry policy consult this — no string matching anywhere else.
 */

import type { ClassifiedError, ErrorClassifier } from "../kernel/types.js";
import { ProviderError } from "../providers/iface.js";

export type ErrorReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "network"
  | "context_overflow"
  | "model_not_found"
  | "format_error"
  | "tool_schema"
  | "content_filter"
  | "unknown";

export function createErrorClassifier(): ErrorClassifier {
  return {
    classify(err: unknown, provider: string, model: string): ClassifiedError {
      const { reason, backoffMs } = diagnose(err);
      const userMessage = composeUserMessage(reason, err, provider, model);
      return {
        reason,
        retryable: isRetryable(reason),
        backoffMs,
        shouldFallback: shouldFallback(reason),
        userMessage,
      };
    },
  };
}

const PROVIDER_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

function composeUserMessage(
  reason: ErrorReason,
  err: unknown,
  provider: string,
  model: string,
): string | undefined {
  const label = PROVIDER_ENV[provider];
  switch (reason) {
    case "auth":
      if (label) {
        return `No API key configured for ${provider}. Run: /keys set ${label} <your-key>
  Or try a free model: /model tencent/hy3-preview:free`;
      }
      return `Authentication failed for ${provider}. Check your API key or run: dirgha setup`;
    case "rate_limit":
      return `Rate limited by ${provider}. Waiting and retrying automatically.
  Tip: Add more providers for fallback.`;
    case "overloaded":
      return `${provider} is overloaded. Trying fallback...`;
    case "model_not_found":
      return `Model not found: ${model}. Check available: /models`;
    case "billing":
      return `Billing issue with ${provider}. Check your account balance.
  Tip: Switch to a free model: /model tencent/hy3-preview:free`;
    default: {
      const msg = err instanceof Error ? err.message : String(err);
      if (/5\d\d/.test(msg)) {
        return `Server error from ${provider}. Retrying...`;
      }
      if (/timeout|timed out/i.test(msg)) {
        return `Request to ${provider} timed out. Retrying...`;
      }
      return undefined;
    }
  }
}

function diagnose(err: unknown): { reason: ErrorReason; backoffMs?: number } {
  if (err instanceof ProviderError) {
    const status = err.status ?? 0;
    if (status === 401 || status === 403) return { reason: "auth" };
    if (status === 402) return { reason: "billing" };
    if (status === 404) return { reason: "model_not_found" };
    if (status === 408) return { reason: "timeout", backoffMs: 1000 };
    if (status === 413) return { reason: "context_overflow" };
    if (status === 415 || status === 422) return { reason: "format_error" };
    if (status === 429) return { reason: "rate_limit", backoffMs: 4000 };
    if (status === 503 || status === 529)
      return { reason: "overloaded", backoffMs: 3000 };
    if (status >= 500) return { reason: "overloaded", backoffMs: 2000 };
    const msg = err.message.toLowerCase();
    if (msg.includes("content filter") || msg.includes("content policy"))
      return { reason: "content_filter" };
    if (msg.includes("tool") && msg.includes("schema"))
      return { reason: "tool_schema" };
    if (msg.includes("context length")) return { reason: "context_overflow" };
    return { reason: "unknown" };
  }
  const message =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err).toLowerCase();
  if (message.includes("timed out") || message.includes("abort"))
    return { reason: "timeout", backoffMs: 1000 };
  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("network")
  )
    return { reason: "network", backoffMs: 1000 };
  return { reason: "unknown" };
}

function isRetryable(reason: ErrorReason): boolean {
  return (
    reason === "rate_limit" ||
    reason === "overloaded" ||
    reason === "timeout" ||
    reason === "network"
  );
}

function shouldFallback(reason: ErrorReason): boolean {
  return (
    reason === "rate_limit" ||
    reason === "overloaded" ||
    reason === "model_not_found" ||
    reason === "billing"
  );
}
