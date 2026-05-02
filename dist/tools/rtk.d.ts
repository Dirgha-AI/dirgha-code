/**
 * rtk tool — token-cheap shell command execution.
 *
 * Wraps shell commands through the `rtk` binary, which filters and
 * compresses stdout to strip noise (progress bars, ANSI, verbose boilerplate).
 * Falls back to direct execution when rtk is not installed so the tool
 * is always usable regardless of host environment.
 *
 * Install rtk: https://github.com/rtk-ai/rtk
 */
import type { Tool } from "./registry.js";
export declare const rtkTool: Tool;
