/**
 * Error classifier. Maps any provider error into a structured
 * ClassifiedError with actionable recovery hints. The agent loop and
 * retry policy consult this — no string matching anywhere else.
 */
import type { ErrorClassifier } from "../kernel/types.js";
export type ErrorReason = "auth" | "billing" | "rate_limit" | "overloaded" | "timeout" | "network" | "context_overflow" | "model_not_found" | "format_error" | "tool_schema" | "content_filter" | "unknown";
export declare function createErrorClassifier(): ErrorClassifier;
