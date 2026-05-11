/**
 * tools/gpu-compute.ts — GPU compute tools for the CLI agent.
 *
 * The agent can provision GPU instances, check status, list available
 * GPU types, and destroy instances. Uses the GPU provider abstraction
 * layer (src/gpu/providers.ts).
 *
 * Currently supports: RunPod (+ Spheron, Akash planned).
 *
 * The agent never needs to know which provider — the tool auto-selects
 * the cheapest available GPU that meets the requirements.
 */
import type { Tool } from "./registry.js";
export declare const gpuListTool: Tool;
export declare const gpuComputeTool: Tool;
export declare const gpuStatusTool: Tool;
export declare const gpuMarketListTool: Tool;
export declare const gpuMarketPostTool: Tool;
export declare const gpuDestroyTool: Tool;
