/**
 * studio.ts — Image, video, and audio generation tools for the CLI agent.
 *
 * The agent can generate images (NVIDIA SD3 free, OpenRouter paid),
 * videos (Fal.ai/Replicate), and audio (TTS) using API keys from the
 * key store. Billing is handled by the provider for paid models.
 *
 * Free models (NVIDIA SD3/SDXL) require only the NVIDIA_API_KEY.
 */
import type { Tool } from "./registry.js";
export declare const imageGenerateTool: Tool;
export declare const speechToTextTool: Tool;
export declare const videoGenerateTool: Tool;
export declare const audioGenerateTool: Tool;
