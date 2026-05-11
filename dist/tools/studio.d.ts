/**
 * studio.ts — Image, video, audio, and speech tools.
 *
 * Two auth modes:
 *   1. GATEWAY — user is logged in (has ~/.dirgha/credentials.json).
 *      Calls go through api.dirgha.ai which handles billing via checkBilling().
 *   2. BYOK — user has provider API keys set via `dirgha keys set`.
 *      Calls go directly to the provider. User pays provider directly.
 *
 * Gateway is tried first. Falls back to BYOK if no token found.
 */
import type { Tool } from "./registry.js";
export declare const imageGenerateTool: Tool;
export declare const speechToTextTool: Tool;
export declare const videoGenerateTool: Tool;
export declare const audioGenerateTool: Tool;
