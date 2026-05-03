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
  const msg = err instanceof Error ? err.message : String(err);
  switch (reason) {
    case "auth": {
      // Distinguish "no key configured" from "key is wrong/expired"
      const keyRequired =
        msg.includes("is required") || msg.includes("No API key configured");
      if (label && keyRequired) {
        return `No API key configured for ${provider}.
  Get one at: https://dirgha.ai/models (or bring your own key)
  Add it:  /keys set ${label} <your-key>
  Free model:  /model tencent/hy3-preview:free`;
      }
      if (label) {
        return `Your ${label} was rejected by ${provider} (401/403).
  The key may be expired, revoked, or has insufficient permissions.
  Get a new key at your provider dashboard, then: /keys set ${label} <new-key>`;
      }
      return `Authentication failed for ${provider}. Check your API key or run: dirgha setup`;
    }
    case "rate_limit":
      return `Rate limited by ${provider}. Waiting and retrying automatically.
  Tip: Add more providers for fallback with /keys set`;
    case "overloaded":
      return `${provider} is overloaded. Trying fallback...`;
    case "model_not_found":
      return `Model not found: ${model}.
  Check available models: /models
  Try an alternative: /model deepseek-ai/deepseek-v4-pro`;
    case "billing":
      return `Billing issue with ${provider}.
  Check your account balance or switch to a free model: /model tencent/hy3-preview:free`;
    case "context_overflow":
      return `Message too long for ${model}. Try /compact or switch to a long-context model.`;
    case "content_filter":
      return `Content filtered by ${provider}. Reframe your prompt or try another model.`;
    case "tool_schema":
      return `Tool schema incompatible with ${provider}. This is an internal error — try /model to switch.`;
    case "network":
      return `Cannot reach ${provider}. Check your connection or try a different provider.`;
    case "format_error":
    case "timeout":
    default: {
      if (/reasoning_content/i.test(msg)) {
        return `The model requires reasoning echo-back. This should be handled automatically — if it persists, try a different model: /model deepseek-v4-pro`;
      }
      if (/5\d\d/.test(msg)) {
        return `Server error from ${provider}. Retrying...`;
      }
      if (/timeout|timed out/i.test(msg)) {
        return `Request to ${provider} timed out. Retrying...`;
      }
      if (/403|forbidden/i.test(msg)) {
        return `${provider} returned 403. Your key doesn't have access to ${model}.
  Try: /model deepseek-ai/deepseek-v4-pro (works with most keys)`;
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
