/**
 * Read a file from disk with optional offset/limit windowing. Binary
 * files are rejected with a clear message; line-based windowing uses
 * cat -n style numbering so the model can cite line numbers reliably.
 */
import type { Tool } from "./registry.js";
export declare const fsReadTool: Tool;
