/**
 * dirgha voice — Record speech from microphone and transcribe it.
 *
 * Usage:
 *   dirgha voice              Record → transcribe → print text
 *   dirgha voice "prompt"     Record → transcribe → send as ask prompt
 *   dirgha voice --list       List audio input devices
 *
 * Requires: arecord (Linux), sox (macOS), or ffmpeg (any).
 * Transcription uses Groq Whisper (free) or OpenAI Whisper.
 */
import type { Subcommand } from "./index.js";
export declare const voiceSubcommand: Subcommand;
