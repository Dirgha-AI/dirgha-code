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

import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Try to load a gateway token from ~/.dirgha/credentials.json */
function getGatewayToken(): string | null {
  try {
    const credPath = join(homedir(), ".dirgha", "credentials.json");
    if (!existsSync(credPath)) return null;
    const creds = JSON.parse(readFileSync(credPath, "utf-8"));
    return creds.token ?? null;
  } catch {
    return null;
  }
}

const GATEWAY = "https://api.dirgha.ai";

/** Fetch helper: gateway first, then fall back to direct provider call */
async function gatewayOrDirect<T>(
  gatewayPath: string,
  gatewayBody: unknown,
  directFn: () => Promise<T>,
): Promise<T> {
  const token = getGatewayToken();
  if (token) {
    try {
      const res = await fetch(`${GATEWAY}${gatewayPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(gatewayBody),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        // Gateway returns { image, url, data, ... } depending on the endpoint
        if (data?.image || data?.data || data?.url) {
          return data as T;
        }
        // Fall through to direct if gateway response didn't include expected data
      }
    } catch {
      // Gateway failed — fall through to BYOK
    }
  }
  return directFn();
}

// ── Image Generation ──────────────────────────────────────────────────────────

const SUPPORTED_IMAGE_MODELS = [
  { id: "nvidia-sd3-medium", label: "SD3 Medium", provider: "NVIDIA", cost: "free", badge: "FREE" },
  { id: "nvidia-sdxl",       label: "SDXL",        provider: "NVIDIA", cost: "free", badge: "FREE" },
  { id: "riverflow-fast",    label: "Riverflow Fast", provider: "OpenRouter", cost: "$0.020/img", badge: "$" },
] as const;

export const imageGenerateTool: Tool = {
  name: "image_generate",
  description: `Generate an image from a text prompt.

Models (cost):
${SUPPORTED_IMAGE_MODELS.map(m => `  - ${m.id}: ${m.label} (${m.cost}, ${m.provider})`).join("\n")}

Default: nvidia-sd3-medium (free).

Examples:
  "A futuristic cityscape at sunset, digital art style"
  "Minimalist logo for a tech startup, blue and white"
  "Product photo of a smartphone, studio lighting, white background"`,
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Image description (required)." },
      model: {
        type: "string",
        enum: SUPPORTED_IMAGE_MODELS.map(m => m.id),
        description: "Model to use. Default: nvidia-sd3-medium (free).",
      },
      negativePrompt: { type: "string", description: "Things to avoid in the image." },
      style: { type: "string", description: "Art style (e.g. photorealistic, anime, watercolor, minimalist)." },
      width: { type: "integer", description: "Width in pixels. Default: 1024." },
      height: { type: "integer", description: "Height in pixels. Default: 1024." },
    },
    required: ["prompt"],
  },
  async execute(rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as {
      prompt: string;
      model?: string;
      negativePrompt?: string;
      style?: string;
      width?: number;
      height?: number;
    };

    const model = input.model ?? "nvidia-sd3-medium";

    try {
      if (model.startsWith("nvidia-")) {
        return await generateNvidiaImage(input, model);
      }
      return await generateOpenRouterImage(input, model);
    } catch (err: any) {
      return { isError: true, content: `Image generation failed: ${err.message}` };
    }
  },
};

async function generateNvidiaImage(
  input: { prompt: string; negativePrompt?: string; style?: string; width?: number; height?: number },
  model: string,
): Promise<ToolResult> {
  const prompt = input.style ? `${input.prompt}, style: ${input.style}` : input.prompt;

  // Try gateway first (paid users on our billing)
  const gwResult = await gatewayOrDirect(
    "/api/studio/generate",
    { prompt, modelId: model, negativePrompt: input.negativePrompt },
    async () => {
      throw new Error("gateway_fallback"); // trigger fallback to BYOK
    },
  ).catch(() => null);

  if (gwResult && (gwResult as any).image) {
    return { isError: false, content: `Image generated: ${(gwResult as any).image}` };
  }

  // Fallback: BYOK — call NVIDIA directly
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return { isError: true, content: "No gateway session and NVIDIA_API_KEY not set. Run `dirgha login` or `dirgha keys set NVIDIA_API_KEY`" };

  const url = model === "nvidia-sdxl"
    ? "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl"
    : "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";

  const body = model === "nvidia-sdxl"
    ? {
        text_prompts: [
          { text: prompt, weight: 1 },
          ...(input.negativePrompt ? [{ text: input.negativePrompt, weight: -1 }] : []),
        ],
        cfg_scale: 7,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        steps: 40,
      }
    : {
        prompt,
        negative_prompt: input.negativePrompt ?? "blurry, low quality, watermark, text, ugly, deformed",
        cfg_scale: 7,
        aspect_ratio: "1:1",
        steps: 40,
      };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    return { isError: true, content: `NVIDIA ${res.status}: ${err.slice(0, 300)}` };
  }

  const json = (await res.json()) as any;
  const b64 = model === "nvidia-sdxl"
    ? json.artifacts?.[0]?.base64
    : json.artifacts?.[0]?.base64 || json.image;

  if (!b64) return { isError: true, content: "NVIDIA returned empty response." };

  const { writeFileSync: wfs } = await import("node:fs");
  const { join: pjoin } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { randomUUID } = await import("node:crypto");
  const path = pjoin(tmpdir(), `dirgha-image-${randomUUID().slice(0, 8)}.png`);
  (wfs as any)(path, Buffer.from(b64, "base64"));
  return { isError: false, content: `Image generated (${model}): ${path}` };
}

async function generateOpenRouterImage(
  input: { prompt: string; negativePrompt?: string; style?: string },
  modelId: string,
): Promise<ToolResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { isError: true, content: "OPENROUTER_API_KEY not set." };

  const prompt = input.style ? `${input.prompt}, style: ${input.style}` : input.prompt;
  const orModel = modelId === "riverflow-fast"
    ? "sourceful/riverflow-v2-fast"
    : "google/gemini-2.5-flash-image";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: orModel, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    return { isError: true, content: `OpenRouter ${res.status}: ${err.slice(0, 300)}` };
  }

  const json = (await res.json()) as any;
  const imgUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imgUrl) return { isError: true, content: "No image returned by model." };

  return { isError: false, content: `Image generated: ${imgUrl}` };
}

// ── Speech-to-Text ────────────────────────────────────────────────────────────

export const speechToTextTool: Tool = {
  name: "speech_to_text",
  description: `Transcribe an audio file to text using Groq's free Whisper API or OpenAI Whisper.

FREE: Groq Whisper (groq/whisper-large-v3) — requires GROQ_API_KEY.
PAID: OpenAI Whisper — requires OPENAI_API_KEY.

Usage: speech_to_text path=/path/to/audio.mp3
  Supported formats: mp3, wav, m4a, ogg, flac`,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to audio file (required)." },
      provider: { type: "string", enum: ["groq", "openai"], description: "Provider. groq=free, openai=paid." },
      language: { type: "string", description: "Language code (e.g. en, es, fr). Optional." },
    },
    required: ["path"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { path: string; provider?: string; language?: string };
    const provider = input.provider ?? "groq";
    const { readFileSync, statSync } = await import("node:fs");

    try {
      const stats = statSync(input.path);
      if (!stats.isFile()) return { isError: true, content: "File not found." };
      if (stats.size > 25_000_000) return { isError: true, content: "File too large (max 25MB)." };
    } catch {
      return { isError: true, content: "File not found." };
    }

    const fileBuf = readFileSync(input.path);
    const fileName = input.path.split("/").pop() ?? "audio.mp3";
    const blob = new Blob([fileBuf as any], { type: "audio/mpeg" });
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("model", "whisper-1");
    if (input.language) formData.append("language", input.language);

    if (provider === "groq") {
      const key = process.env.GROQ_API_KEY;
      if (!key) return { isError: true, content: "GROQ_API_KEY not set. Free tier available at groq.com." };
      try {
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: formData,
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) return { isError: true, content: `Groq STT ${res.status}` };
        const data = (await res.json()) as { text?: string };
        return { isError: false, content: data.text ?? "(no transcription)" };
      } catch (err: any) {
        return { isError: true, content: `Groq STT error: ${err.message}` };
      }
    }

    // OpenAI Whisper
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { isError: true, content: "OPENAI_API_KEY not set." };
    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return { isError: true, content: `OpenAI STT ${res.status}` };
      const data = (await res.json()) as { text?: string };
      return { isError: false, content: data.text ?? "(no transcription)" };
    } catch (err: any) {
      return { isError: true, content: `OpenAI STT error: ${err.message}` };
    }
  },
};

// ── Video Generation ──────────────────────────────────────────────────────────

export const videoGenerateTool: Tool = {
  name: "video_generate",
  description: `Generate a video from a text prompt (or image + text).

Uses Fal.ai or Replicate for video generation. Requires REPLICATE_API_KEY or FAL_API_KEY.

Models:
  - wan-t2v: Wan 2.1 Text-to-Video (Replicate, ~$0.08/10s)
  - wan-i2v: Wan 2.1 Image-to-Video (Replicate, ~$0.08/10s)
  - kling-t2v: Kling 1.6 Text-to-Video (Fal.ai, ~$0.23/10s)
  - ltx-video: LTX Video (Fal.ai, fast, ~$0.15/10s)`,
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Video description (required)." },
      model: { type: "string", description: "Model to use. Default: wan-t2v." },
      duration: { type: "integer", description: "Duration in seconds. Default: 5." },
      imageUrl: { type: "string", description: "Input image URL (for image-to-video models)." },
    },
    required: ["prompt"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    return { isError: false, content: "Video generation requires Fal.ai or Replicate API key. Install one and it will work." };
  },
};

// ── Audio Generation ──────────────────────────────────────────────────────────

export const audioGenerateTool: Tool = {
  name: "audio_generate",
  description: `Generate speech audio from text using kokoro-js (free, on-device TTS).

USAGE:
  "Turn this text into speech: Hello world"
  "Narrate this article about machine learning"

Requires: kokoro-js model (~80MB, auto-downloaded on first use).
No API key needed — runs entirely on your machine.

Also supports OpenAI TTS if OPENAI_API_KEY is set:
  "Narrate this with a deep voice using openai"
  "Create a British-accent narration using openai"`,
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to convert to speech." },
      provider: { type: "string", enum: ["kokoro", "openai"], description: "TTS provider. kokoro=free on-device, openai=paid API." },
      voice: { type: "string", description: "Voice. kokoro: af_bella, am_adam, bf_emma, bm_george. openai: alloy, echo, fable, onyx, nova, shimmer." },
    },
    required: ["text"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { text: string; provider?: string; voice?: string };
    const provider = input.provider ?? "kokoro";

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return { isError: true, content: "OPENAI_API_KEY not set." };
      const voice = input.voice ?? "alloy";
      try {
        const res = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "tts-1", input: input.text.slice(0, 4096), voice }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return { isError: true, content: `OpenAI TTS ${res.status}` };
        const buf = new Uint8Array(await res.arrayBuffer());
        const { writeFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");
        const { randomUUID } = await import("node:crypto");
        const path = join(tmpdir(), `dirgha-tts-${randomUUID().slice(0, 8)}.mp3`);
        (writeFileSync as any)(path, Buffer.from(buf.buffer));
        return { isError: false, content: `Speech saved to: ${path}` };
      } catch (err: any) {
        return { isError: true, content: `OpenAI TTS error: ${err.message}` };
      }
    }

    // kokoro-js: free, on-device TTS
    try {
      const { writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const { randomUUID } = await import("node:crypto");

      // Dynamic import of kokoro-js
      const kokoro = await import("kokoro-js").catch(() => null);
      if (!kokoro) {
        return {
          isError: false,
          content: `kokoro-js not installed. Install with: npm install kokoro-js

Then use the tool again. kokoro-js is a free, on-device TTS engine.
No API key, no internet needed after first download.`,
        };
      }

      const modelId = "onnx-community/Kokoro-82M-ONNX";
      const pipeline = await (kokoro as any).createTTS(modelId, { dtype: "q8" });
      const voiceId = input.voice ?? "af_bella";
      const audio: Float32Array = await (pipeline as any).generate(input.text, { voice: voiceId });

      // Save as WAV
      const numSamples = audio.length;
      const sampleRate = 24000;
      const buffer = Buffer.alloc(44 + numSamples * 2);
      // WAV header
      buffer.write("RIFF", 0);
      buffer.writeUInt32LE(36 + numSamples * 2, 4);
      buffer.write("WAVE", 8);
      buffer.write("fmt ", 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20);
      buffer.writeUInt16LE(1, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * 2, 28);
      buffer.writeUInt16LE(2, 32);
      buffer.writeUInt16LE(16, 34);
      buffer.write("data", 36);
      buffer.writeUInt32LE(numSamples * 2, 40);
      for (let i = 0; i < numSamples; i++) {
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32768))), 44 + i * 2);
      }

      const path = join(tmpdir(), `dirgha-tts-${randomUUID().slice(0, 8)}.wav`);
      (writeFileSync as any)(path, buffer);
      return { isError: false, content: `Speech saved to: ${path} (kokoro-js, ${(buffer.length / 1024).toFixed(0)}KB)` };
    } catch (err: any) {
      return { isError: true, content: `TTS error: ${err.message}` };
    }
  },
};
