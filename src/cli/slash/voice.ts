/**
 * /voice — Record speech from mic, transcribe, and submit as prompt.
 *
 * Requires: arecord (Linux) or sox (macOS) and GROQ_API_KEY or OPENAI_API_KEY.
 * Usage:
 *   /voice          Record 10s → transcribe → submit
 *   /voice 5        Record 5s → transcribe → submit
 */

import { spawnSync, execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SlashCommand } from "./types.js";

function detectRecorder(): string | null {
  for (const cmd of ["arecord", "sox", "ffmpeg"]) {
    try {
      execSync(`which ${cmd} 2>/dev/null`, { stdio: "pipe" });
      return cmd;
    } catch {}
  }
  return null;
}

async function transcribe(path: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.length > 10) {
    const buf = readFileSync(path);
    const blob = new Blob([buf as any], { type: "audio/wav" });
    const fd = new FormData();
    fd.append("file", blob, "voice.wav");
    fd.append("model", "whisper-large-v3-turbo");
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
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.length > 10) {
    const buf = readFileSync(path);
    const blob = new Blob([buf as any], { type: "audio/wav" });
    const fd = new FormData();
    fd.append("file", blob, "voice.wav");
    fd.append("model", "whisper-1");
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

export const voiceSlashCommand: SlashCommand = {
  name: "voice",
  description: "🎤 Record voice, transcribe, and submit as prompt",
  async execute(args: string[], _ctx: any): Promise<string | undefined> {
    const recorder = detectRecorder();
    if (!recorder) {
      return "❌ No audio recorder. Install arecord (Linux) or sox (macOS).";
    }
    if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      return "❌ No STT key. Set GROQ_API_KEY (free) or OPENAI_API_KEY.";
    }

    const duration = parseInt(args[0], 10) || 10;
    const outPath = join(tmpdir(), `dirgha-voice-${randomUUID().slice(0, 8)}.wav`);

    process.stderr.write(`🎤 Recording ${duration}s... `);

    try {
      const r = recorder === "arecord"
        ? spawnSync("arecord", ["-d", String(duration), "-f", "S16_LE", "-r", "16000", "-c", "1", outPath], { timeout: (duration + 5) * 1000 })
        : spawnSync("sox", ["-d", "-r", "16000", "-c", "1", "-e", "signed-integer", "-b", "16", outPath, "trim", "0", String(duration)], { timeout: (duration + 5) * 1000 });

      if (r.status !== 0) return "❌ Recording failed.";
    } catch {
      return "❌ Recording failed.";
    }

    process.stderr.write("⏳ Transcribing...\n");
    const text = await transcribe(outPath);
    try { unlinkSync(outPath); } catch {}

    if (!text) return "❌ No speech detected.";

    // Return the transcribed text — the parent (App.tsx) will submit it
    // as the next user prompt.
    return text;
  },
};
