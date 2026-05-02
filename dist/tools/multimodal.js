/**
 * Multimodal tool: a minimal surface for describing images, transcribing
 * audio, and generating images. The tool is shaped as a single entry
 * point (`action: 'describe_image' | 'transcribe_audio' | 'generate_image'`)
 * so the agent only learns one name and the provider plumbing stays
 * internal.
 *
 * Status of the three actions:
 *   - describe_image / transcribe_audio: best-effort. They route through
 *     the active provider's `stream` API with a multimodal payload when
 *     the model advertises support; otherwise they return a clear
 *     "provider lacks multimodal capability" result. They are NOT stubs —
 *     they will do real work on capable providers (Gemini, Claude vision,
 *     OpenAI gpt-4o) — but they can fail politely elsewhere.
 *   - generate_image: real. Routes through the active provider's
 *     optional `generateImage()` method (NVIDIA Flux Schnell by default,
 *     OpenAI DALL-E 3 as fallback when NVIDIA is unavailable and
 *     OPENAI_API_KEY is set). The decoded PNG is written to disk and
 *     the tool returns the absolute path.
 *
 * This file imports two provider classes lazily for fallback construction
 * when the active provider doesn't expose `generateImage`. It does not
 * pull in any streaming/chat-completions internals.
 */
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname, sep } from "node:path";
import { OpenAIProvider } from "../providers/openai.js";
import { NvidiaProvider } from "../providers/nvidia.js";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const IMAGE_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
};
const AUDIO_EXT = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
};
const DEFAULT_IMAGE_WIDTH = 1024;
const DEFAULT_IMAGE_HEIGHT = 1024;
const NVIDIA_IMAGE_MODEL_HINTS = new Set([
    "flux.1-schnell",
    "flux-schnell",
    "nvidia/flux",
    "flux",
    "black-forest-labs/flux.1-schnell",
]);
const OPENAI_IMAGE_MODEL_HINTS = new Set([
    "dall-e-3",
    "dall-e-2",
    "dall-e",
    "dalle",
    "openai/dall-e-3",
]);
export function createMultimodalTool(opts) {
    const supportsMultimodal = opts.supportsMultimodal ??
        ((modelId) => opts.provider.supportsTools(modelId));
    return {
        name: "multimodal",
        description: 'Describe an image, transcribe audio, or generate an image. Pass action="describe_image" with path to an image, action="transcribe_audio" with path to an audio file, or action="generate_image" with a prompt (NVIDIA Flux Schnell by default, OpenAI DALL-E 3 fallback).',
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["describe_image", "transcribe_audio", "generate_image"],
                    description: "Which multimodal operation to perform.",
                },
                path: {
                    type: "string",
                    description: "Filesystem path to the image/audio file (required for describe/transcribe).",
                },
                prompt: {
                    type: "string",
                    description: "Prompt text — used as the question for describe_image or the generation prompt.",
                },
                model: {
                    type: "string",
                    description: 'Override the model id. For generate_image, "flux.1-schnell" forces NVIDIA, "dall-e-3" forces OpenAI.',
                },
                outputPath: {
                    type: "string",
                    description: "For generate_image: where to write the PNG. Defaults to ./dirgha-image-<timestamp>.png in the session cwd.",
                },
                width: {
                    type: "number",
                    description: "Image width in pixels (default 1024).",
                },
                height: {
                    type: "number",
                    description: "Image height in pixels (default 1024).",
                },
                seed: {
                    type: "number",
                    description: "Optional deterministic seed (NVIDIA only).",
                },
                steps: {
                    type: "number",
                    description: "Sampling steps (NVIDIA only, default 4 for Flux Schnell).",
                },
            },
            required: ["action"],
        },
        async execute(rawInput, ctx) {
            const input = rawInput;
            const model = input.model ?? opts.defaultModel;
            if (input.action === "generate_image") {
                return generateImage({ input, ctx, activeProvider: opts.provider });
            }
            if (input.action === "describe_image") {
                return describeImage({
                    path: input.path,
                    prompt: input.prompt ?? "Describe this image in detail.",
                    ctx,
                    provider: opts.provider,
                    model,
                    capable: supportsMultimodal(model),
                });
            }
            if (input.action === "transcribe_audio") {
                return transcribeAudio({
                    path: input.path,
                    prompt: input.prompt ??
                        "Transcribe this audio verbatim. Preserve speaker turns if distinguishable.",
                    ctx,
                    provider: opts.provider,
                    model,
                    capable: supportsMultimodal(model),
                });
            }
            return {
                content: `Unknown multimodal action: ${String(input.action)}`,
                isError: true,
            };
        },
    };
}
async function describeImage(a) {
    if (!a.path)
        return {
            content: "describe_image requires a `path` to an image file.",
            isError: true,
        };
    const loaded = await loadMedia(a.path, a.ctx.cwd, IMAGE_EXT, MAX_IMAGE_BYTES, "image");
    if ("error" in loaded)
        return { content: loaded.error, isError: true };
    if (!a.capable) {
        return {
            content: multimodalCapabilityNotice("describe_image", a.model, loaded.mime, loaded.bytes),
            isError: false,
            metadata: {
                stub: true,
                reason: "provider-multimodal-capability",
                model: a.model,
            },
        };
    }
    const messages = multimodalMessage({
        instruction: a.prompt,
        mediaKind: "image",
        dataUrl: loaded.dataUrl,
        mime: loaded.mime,
    });
    return streamProviderText(a.provider, a.model, messages, "describe_image");
}
async function transcribeAudio(a) {
    if (!a.path)
        return {
            content: "transcribe_audio requires a `path` to an audio file.",
            isError: true,
        };
    const loaded = await loadMedia(a.path, a.ctx.cwd, AUDIO_EXT, MAX_AUDIO_BYTES, "audio");
    if ("error" in loaded)
        return { content: loaded.error, isError: true };
    if (!a.capable) {
        return {
            content: multimodalCapabilityNotice("transcribe_audio", a.model, loaded.mime, loaded.bytes),
            isError: false,
            metadata: {
                stub: true,
                reason: "provider-multimodal-capability",
                model: a.model,
            },
        };
    }
    const messages = multimodalMessage({
        instruction: a.prompt,
        mediaKind: "audio",
        dataUrl: loaded.dataUrl,
        mime: loaded.mime,
    });
    return streamProviderText(a.provider, a.model, messages, "transcribe_audio");
}
async function loadMedia(path, cwd, allowed, maxBytes, kind) {
    const abs = resolve(cwd, path);
    if (!abs.startsWith(cwd + sep) && abs !== cwd) {
        return { error: `Path escapes working directory: ${path}` };
    }
    const info = await stat(abs).catch(() => undefined);
    if (!info || !info.isFile())
        return { error: `No such ${kind} file: ${path}` };
    if (info.size > maxBytes) {
        return {
            error: `${kind} too large: ${info.size} bytes (max ${maxBytes}).`,
        };
    }
    const ext = extname(abs).toLowerCase();
    const mime = allowed[ext];
    if (!mime) {
        const supported = Object.keys(allowed).join(", ");
        return {
            error: `Unsupported ${kind} extension "${ext}". Supported: ${supported}`,
        };
    }
    const buf = await readFile(abs);
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    return { dataUrl, mime, bytes: info.size };
}
function multimodalCapabilityNotice(action, model, mime, bytes) {
    return [
        `Active model "${model}" does not expose a multimodal capability in this build.`,
        `The ${action === "describe_image" ? "image" : "audio"} was loaded successfully (${mime}, ${bytes} bytes)`,
        `but the request was not sent. Switch to a vision- or audio-capable model`,
        `(e.g. gemini-1.5-pro, claude-3-5-sonnet, gpt-4o) and retry.`,
    ].join(" ");
}
/**
 * Build a provider-agnostic multimodal message. We stuff the data URL
 * into a tagged text part — providers that natively understand
 * `image_url` style content are expected to adapt via their own
 * serialisation layer; providers that don't will at least see the
 * instruction and a base64 blob and may handle it or return an error
 * the agent loop can surface.
 */
function multimodalMessage(args) {
    return [
        {
            role: "user",
            content: [
                { type: "text", text: args.instruction },
                {
                    type: "text",
                    text: `[${args.mediaKind.toUpperCase()} ATTACHMENT mime=${args.mime}]\n${args.dataUrl}\n[/${args.mediaKind.toUpperCase()} ATTACHMENT]`,
                },
            ],
        },
    ];
}
async function streamProviderText(provider, model, messages, action) {
    const req = { model, messages };
    let text = "";
    let errored = false;
    let errMsg = "";
    try {
        for await (const ev of provider.stream(req)) {
            if (ev.type === "text_delta")
                text += ev.delta;
            if (ev.type === "error") {
                errored = true;
                errMsg = ev.message;
            }
        }
    }
    catch (e) {
        errored = true;
        errMsg = e instanceof Error ? e.message : String(e);
    }
    const trimmed = text.trim();
    if (errored && !trimmed) {
        return {
            content: `multimodal/${action} failed: ${errMsg || "provider error"}`,
            isError: true,
        };
    }
    return {
        content: trimmed || "(empty response)",
        isError: false,
        metadata: { action, model, provider: provider.id },
    };
}
async function generateImage(a) {
    const prompt = a.input.prompt?.trim();
    if (!prompt) {
        return { content: "generate_image requires a `prompt`.", isError: true };
    }
    const modelHint = a.input.model?.toLowerCase();
    const forcedProvider = resolveForcedProvider(modelHint);
    const width = a.input.width ?? DEFAULT_IMAGE_WIDTH;
    const height = a.input.height ?? DEFAULT_IMAGE_HEIGHT;
    const req = {
        prompt,
        model: a.input.model,
        width,
        height,
        seed: a.input.seed,
        steps: a.input.steps,
    };
    const attempts = buildProviderAttempts({
        active: a.activeProvider,
        env: a.ctx.env,
        forced: forcedProvider,
    });
    if (attempts.length === 0) {
        return {
            content: "generate_image: no image-capable provider available. Set NVIDIA_API_KEY or OPENAI_API_KEY.",
            isError: true,
        };
    }
    const errors = [];
    let result;
    let servingProvider;
    for (const attempt of attempts) {
        try {
            if (!attempt.provider.generateImage)
                continue;
            result = await attempt.provider.generateImage(req, a.ctx.signal);
            servingProvider = attempt.provider;
            break;
        }
        catch (err) {
            errors.push(`${attempt.label}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (!result || !servingProvider) {
        return {
            content: `generate_image failed. Attempts: ${errors.join(" | ") || "no provider exposed generateImage"}`,
            isError: true,
        };
    }
    const outputPath = resolveOutputPath(a.input.outputPath, a.ctx.cwd);
    try {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, Buffer.from(result.base64, "base64"));
    }
    catch (err) {
        return {
            content: `generate_image: decoded image but failed to write ${outputPath}: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
        };
    }
    const data = {
        path: outputPath,
        model: result.model,
        width,
        height,
        provider: servingProvider.id,
    };
    return {
        content: `Saved: ${outputPath}`,
        isError: false,
        data,
        metadata: {
            action: "generate_image",
            model: result.model,
            provider: servingProvider.id,
            mimeType: result.mimeType,
        },
    };
}
function resolveForcedProvider(modelHint) {
    if (!modelHint)
        return undefined;
    if (NVIDIA_IMAGE_MODEL_HINTS.has(modelHint))
        return "nvidia";
    if (OPENAI_IMAGE_MODEL_HINTS.has(modelHint))
        return "openai";
    return undefined;
}
function buildProviderAttempts(args) {
    const attempts = [];
    const seen = new Set();
    const push = (p, label) => {
        if (!p || !p.generateImage)
            return;
        if (seen.has(p.id))
            return;
        seen.add(p.id);
        attempts.push({ provider: p, label });
    };
    if (args.forced === "nvidia") {
        const nvidia = tryBuildNvidia(args.env) ??
            (args.active.id === "nvidia" ? args.active : undefined);
        push(nvidia, "nvidia");
        return attempts;
    }
    if (args.forced === "openai") {
        const openai = tryBuildOpenAI(args.env) ??
            (args.active.id === "openai" ? args.active : undefined);
        push(openai, "openai");
        return attempts;
    }
    // Default order: active provider (if it supports image gen), then NVIDIA, then OpenAI.
    push(args.active, `active(${args.active.id})`);
    push(tryBuildNvidia(args.env), "nvidia");
    push(tryBuildOpenAI(args.env), "openai");
    return attempts;
}
function tryBuildNvidia(env) {
    const key = env.NVIDIA_API_KEY ?? process.env.NVIDIA_API_KEY;
    if (!key)
        return undefined;
    try {
        return new NvidiaProvider({ apiKey: key });
    }
    catch {
        return undefined;
    }
}
function tryBuildOpenAI(env) {
    const key = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!key)
        return undefined;
    try {
        return new OpenAIProvider({ apiKey: key });
    }
    catch {
        return undefined;
    }
}
function resolveOutputPath(requested, cwd) {
    if (requested && requested.length > 0)
        return resolve(cwd, requested);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return resolve(cwd, `dirgha-image-${ts}.png`);
}
//# sourceMappingURL=multimodal.js.map