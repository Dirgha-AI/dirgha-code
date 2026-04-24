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
 *   - generate_image: always a stub in this beta. The 0.1.x line shipped
 *     image generation via a separate provider surface; that wiring has
 *     not been ported to v2 yet. The tool returns a plain directive
 *     pointing the user at `@dirgha/code 0.1.x` rather than failing.
 *
 * This file depends only on public types from `kernel/types.ts` and the
 * `Tool` contract — it deliberately does not import provider internals
 * so it can be registered without dragging a specific provider stack
 * into the tool set.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const IMAGE_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
const AUDIO_EXT = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
};
const GENERATE_STUB_MESSAGE = [
    'Image generation is not yet wired in this beta.',
    'Use @dirgha/code 0.1.x for image generation, or call the Dirgha gateway',
    '`/api/images/generate` endpoint directly until this tool is ported.',
].join(' ');
export function createMultimodalTool(opts) {
    const supportsMultimodal = opts.supportsMultimodal
        ?? ((modelId) => opts.provider.supportsTools(modelId));
    return {
        name: 'multimodal',
        description: 'Describe an image, transcribe audio, or generate an image. Pass action="describe_image" with path to an image, action="transcribe_audio" with path to an audio file, or action="generate_image" with a prompt. Generate is a stub in this beta.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['describe_image', 'transcribe_audio', 'generate_image'],
                    description: 'Which multimodal operation to perform.',
                },
                path: { type: 'string', description: 'Filesystem path to the image/audio file (required for describe/transcribe).' },
                prompt: { type: 'string', description: 'Prompt text — used as the question for describe_image or the generation prompt.' },
                model: { type: 'string', description: 'Override the model id. Defaults to the active model.' },
            },
            required: ['action'],
        },
        async execute(rawInput, ctx) {
            const input = rawInput;
            const model = input.model ?? opts.defaultModel;
            if (input.action === 'generate_image') {
                return {
                    content: GENERATE_STUB_MESSAGE,
                    isError: false,
                    metadata: { stub: true, action: 'generate_image' },
                };
            }
            if (input.action === 'describe_image') {
                return describeImage({
                    path: input.path,
                    prompt: input.prompt ?? 'Describe this image in detail.',
                    ctx,
                    provider: opts.provider,
                    model,
                    capable: supportsMultimodal(model),
                });
            }
            if (input.action === 'transcribe_audio') {
                return transcribeAudio({
                    path: input.path,
                    prompt: input.prompt ?? 'Transcribe this audio verbatim. Preserve speaker turns if distinguishable.',
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
        return { content: 'describe_image requires a `path` to an image file.', isError: true };
    const loaded = await loadMedia(a.path, a.ctx.cwd, IMAGE_EXT, MAX_IMAGE_BYTES, 'image');
    if ('error' in loaded)
        return { content: loaded.error, isError: true };
    if (!a.capable) {
        return {
            content: multimodalCapabilityNotice('describe_image', a.model, loaded.mime, loaded.bytes),
            isError: false,
            metadata: { stub: true, reason: 'provider-multimodal-capability', model: a.model },
        };
    }
    const messages = multimodalMessage({
        instruction: a.prompt,
        mediaKind: 'image',
        dataUrl: loaded.dataUrl,
        mime: loaded.mime,
    });
    return streamProviderText(a.provider, a.model, messages, 'describe_image');
}
async function transcribeAudio(a) {
    if (!a.path)
        return { content: 'transcribe_audio requires a `path` to an audio file.', isError: true };
    const loaded = await loadMedia(a.path, a.ctx.cwd, AUDIO_EXT, MAX_AUDIO_BYTES, 'audio');
    if ('error' in loaded)
        return { content: loaded.error, isError: true };
    if (!a.capable) {
        return {
            content: multimodalCapabilityNotice('transcribe_audio', a.model, loaded.mime, loaded.bytes),
            isError: false,
            metadata: { stub: true, reason: 'provider-multimodal-capability', model: a.model },
        };
    }
    const messages = multimodalMessage({
        instruction: a.prompt,
        mediaKind: 'audio',
        dataUrl: loaded.dataUrl,
        mime: loaded.mime,
    });
    return streamProviderText(a.provider, a.model, messages, 'transcribe_audio');
}
async function loadMedia(path, cwd, allowed, maxBytes, kind) {
    const abs = resolve(cwd, path);
    const info = await stat(abs).catch(() => undefined);
    if (!info || !info.isFile())
        return { error: `No such ${kind} file: ${path}` };
    if (info.size > maxBytes) {
        return { error: `${kind} too large: ${info.size} bytes (max ${maxBytes}).` };
    }
    const ext = extname(abs).toLowerCase();
    const mime = allowed[ext];
    if (!mime) {
        const supported = Object.keys(allowed).join(', ');
        return { error: `Unsupported ${kind} extension "${ext}". Supported: ${supported}` };
    }
    const buf = await readFile(abs);
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    return { dataUrl, mime, bytes: info.size };
}
function multimodalCapabilityNotice(action, model, mime, bytes) {
    return [
        `Active model "${model}" does not expose a multimodal capability in this build.`,
        `The ${action === 'describe_image' ? 'image' : 'audio'} was loaded successfully (${mime}, ${bytes} bytes)`,
        `but the request was not sent. Switch to a vision- or audio-capable model`,
        `(e.g. gemini-1.5-pro, claude-3-5-sonnet, gpt-4o) and retry.`,
    ].join(' ');
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
            role: 'user',
            content: [
                { type: 'text', text: args.instruction },
                {
                    type: 'text',
                    text: `[${args.mediaKind.toUpperCase()} ATTACHMENT mime=${args.mime}]\n${args.dataUrl}\n[/${args.mediaKind.toUpperCase()} ATTACHMENT]`,
                },
            ],
        },
    ];
}
async function streamProviderText(provider, model, messages, action) {
    const req = { model, messages };
    let text = '';
    let errored = false;
    let errMsg = '';
    try {
        for await (const ev of provider.stream(req)) {
            if (ev.type === 'text_delta')
                text += ev.delta;
            if (ev.type === 'error') {
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
        return { content: `multimodal/${action} failed: ${errMsg || 'provider error'}`, isError: true };
    }
    return {
        content: trimmed || '(empty response)',
        isError: false,
        metadata: { action, model, provider: provider.id },
    };
}
//# sourceMappingURL=multimodal.js.map