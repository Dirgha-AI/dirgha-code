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

import { spawnSync, execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Subcommand } from "./index.js";

function detectRecorder(): string | null {
  for (const cmd of ["arecord", "sox", "ffmpeg"]) {
    try {
      execSync(`which ${cmd} 2>/dev/null`, { stdio: "pipe" });
      return cmd;
    } catch {}
  }
  return null;
}

function recordAudio(recorder: string, outPath: string, durationSec: number): boolean {
  try {
    if (recorder === "arecord") {
      // Linux: record 16-bit 16kHz mono WAV
      const r = spawnSync("arecord", [
        "-d", String(durationSec),
        "-f", "S16_LE",
        "-r", "16000",
        "-c", "1",
        outPath,
      ], { stdio: "inherit", timeout: (durationSec + 5) * 1000 });
      return r.status === 0;
    }
    if (recorder === "sox") {
      const r = spawnSync("sox", [
        "-d",
        "-r", "16000",
        "-c", "1",
        "-e", "signed-integer",
        "-b", "16",
        outPath,
        "trim", "0", String(durationSec),
      ], { stdio: "inherit", timeout: (durationSec + 5) * 1000 });
      return r.status === 0;
    }
    if (recorder === "ffmpeg") {
      const r = spawnSync("ffmpeg", [
        "-f", "alsa", "-i", "default",
        "-ar", "16000",
        "-ac", "1",
        "-y", outPath,
      ], { stdio: "inherit", timeout: (durationSec + 5) * 1000 });
      return r.status === 0;
    }
    return false;
  } catch {
    return false;
  }
}

async function transcribe(path: string): Promise<string> {
  // Try Groq first (free), fall back to OpenAI
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.length > 10) {
    const buf = readFileSync(path);
    const blob = new Blob([buf as any], { type: "audio/wav" });
    const fd = new FormData();
    fd.append("file", blob, "voice.wav");
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("response_format", "json");
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: fd,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return data.text?.trim() || "";
      }
    } catch {}
  }

  // Fallback to OpenAI Whisper
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.length > 10) {
    const buf = readFileSync(path);
    const blob = new Blob([buf as any], { type: "audio/wav" });
    const fd = new FormData();
    fd.append("file", blob, "voice.wav");
    fd.append("model", "whisper-1");
    fd.append("response_format", "json");
    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return data.text?.trim() || "";
      }
    } catch {}
  }

  return "";
}

export const voiceSubcommand: Subcommand = {
  name: "voice",
  description: "Record speech from microphone and transcribe it",
  async run(argv: string[], _ctx: any): Promise<number> {
    const recorder = detectRecorder();
    if (!recorder) {
      process.stderr.write(
        "❌ No audio recorder found.\n" +
        "Install one:\n" +
        "  Linux:  apt install alsa-utils   (arecord)\n" +
        "  macOS:  brew install sox\n" +
        "  Any:    apt install ffmpeg\n"
      );
      return 1;
    }

    // Check for API keys
    if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      process.stderr.write(
        "❌ No STT API key found.\n" +
        "Set one:\n" +
        "  export GROQ_API_KEY=...    (free, recommended)\n" +
        "  export OPENAI_API_KEY=...  (paid)\n"
      );
      return 1;
    }

    const duration = 10; // seconds
    const outPath = join(tmpdir(), `dirgha-voice-${randomUUID().slice(0, 8)}.wav`);

    process.stderr.write(`🎤 Recording for ${duration} seconds... (speak now)\n`);

    const ok = recordAudio(recorder, outPath, duration);
    if (!ok) {
      process.stderr.write("❌ Recording failed.\n");
      return 1;
    }

    process.stderr.write("⏳ Transcribing...\n");
    const text = await transcribe(outPath);
    try { unlinkSync(outPath); } catch {}

    if (!text) {
      process.stderr.write("❌ Transcription returned empty. Try speaking louder or check your mic.\n");
      return 1;
    }

    // Print the transcribed text
    process.stdout.write(`${text}\n`);

    // If additional args provided, pipe transcribed text into ask
    const extra = argv.filter(a => !a.startsWith("--")).join(" ");
    if (extra) {
      const fullPrompt = `${text}\n\n${extra}`;
      process.stderr.write(`\n📤 Sending to agent...\n`);
      const { askSubcommand } = await import("./ask.js");
      return askSubcommand.run([fullPrompt], _ctx);
    }

    return 0;
  },
};
