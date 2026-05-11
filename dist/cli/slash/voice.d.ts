/**
 * /voice — Record speech from mic, transcribe, and submit as prompt.
 *
 * Requires: arecord (Linux) or sox (macOS) and GROQ_API_KEY or OPENAI_API_KEY.
 * Usage:
 *   /voice          Record 10s → transcribe → submit
 *   /voice 5        Record 5s → transcribe → submit
 */
import type { SlashCommand } from "./types.js";
export declare const voiceSlashCommand: SlashCommand;
