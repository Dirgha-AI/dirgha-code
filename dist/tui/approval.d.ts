/**
 * Approval prompt. Synchronously reads a single-char response from
 * stdin; falls back to a line-based prompt when stdin is not a TTY
 * (e.g., piped invocations).
 */
import type { ApprovalBus } from "../kernel/types.js";
export declare function createTuiApprovalBus(autoApproveTools?: Set<string>): ApprovalBus;
