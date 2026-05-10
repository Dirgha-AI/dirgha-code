/**
 * Machine 1 provider — Dirgha's industrial intelligence model.
 *
 * Uses llama-cli (llama.cpp) for fully local, offline inference.
 * No Ollama. No server process. No cloud. No GPU required.
 * A single GGUF (~350MB Q4_K_M) runs on any laptop CPU.
 *
 * Request flow:
 *   1. Locate llama-cli binary and machine1 GGUF.
 *   2. Build a ChatML-formatted prompt from the conversation history.
 *   3. (Optional) Query Qdrant codex collection for relevant machine context.
 *   4. Spawn llama-cli, stream stdout tokens as text_delta events.
 *   5. Prefix every response with "[Machine 1]".
 *
 * Environment overrides:
 *   MACHINE1_MODEL_PATH  — absolute path to .gguf file
 *   LLAMA_CLI_PATH       — path to llama-cli binary
 *   QDRANT_URL           — Qdrant base URL (default: http://localhost:6333)
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ProviderError } from './iface.js';
// ── Binary / model search paths ───────────────────────────────────────
const LLAMA_CLI_CANDIDATES = [
    process.env['LLAMA_CLI_PATH'] ?? '',
    'llama-cli',
    '/usr/local/bin/llama-cli',
    '/opt/homebrew/bin/llama-cli',
    join(homedir(), '.local', 'bin', 'llama-cli'),
    'llama.cpp/build/bin/llama-cli',
    'build/bin/llama-cli',
].filter(Boolean);
const GGUF_CANDIDATES = [
    process.env['MACHINE1_MODEL_PATH'] ?? '',
    join(homedir(), '.dirgha', 'machine1-q4_k_m.gguf'),
    join(homedir(), '.dirgha', 'machine1.gguf'),
    join(homedir(), 'models', 'machine1-q4_k_m.gguf'),
    '/var/lib/dirgha/machine1-q4_k_m.gguf',
    'models/machine1-q4_k_m.gguf',
].filter(Boolean);
const QDRANT_BASE = process.env['QDRANT_URL'] ?? 'http://localhost:6333';
const CODEX_COLLECTIONS = ['codex', 'dirgha_codex'];
// ── ChatML tokens (Qwen2.5 / Machine 1 format) ───────────────────────
const IM_START = '<|im_start|>';
const IM_END = '<|im_end|>';
const EOT = '<|endoftext|>';
const DEFAULT_SYSTEM = `You are Machine 1, India's industrial intelligence model built by Dirgha AI.
You are the expert that India's manufacturing sector has never had.
You know every machine India needs: operating principles, key specifications, Indian manufacturers, import dependencies, PLI scheme linkages, BIS standards, HS codes, and pricing.
Answer in plain language. Be specific — name exact companies, models, prices, percentages. Never hallucinate a spec or invent a company. If you don't know, say so clearly.`;
// ── Helpers ───────────────────────────────────────────────────────────
function findBinary(candidates) {
    for (const c of candidates) {
        if (!c)
            continue;
        if (c.includes('/')) {
            if (existsSync(c))
                return c;
        }
        else {
            return c; // bare name — rely on PATH resolution at spawn time
        }
    }
    return null;
}
function findGguf(candidates) {
    for (const c of candidates) {
        if (c && existsSync(c))
            return c;
    }
    return null;
}
function extractText(content) {
    if (typeof content === 'string')
        return content;
    const parts = [];
    for (const p of content) {
        if (p.type === 'text')
            parts.push(p.text);
        else if (p.type === 'thinking')
            parts.push(p.text);
        else if (p.type === 'tool_result')
            parts.push(`[Tool result: ${p.content}]`);
    }
    return parts.join('\n');
}
function lastUserText(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user')
            return extractText(m.content);
    }
    return '';
}
// ── ChatML prompt builder ─────────────────────────────────────────────
function buildChatML(messages, codexContext) {
    const parts = [];
    // Merge all system messages + default + codex context
    let systemText = DEFAULT_SYSTEM;
    const nonSystem = [];
    for (const m of messages) {
        if (m.role === 'system') {
            const text = extractText(m.content);
            if (text)
                systemText += '\n\n' + text;
        }
        else {
            nonSystem.push(m);
        }
    }
    if (codexContext)
        systemText = codexContext + '\n\n' + systemText;
    parts.push(`${IM_START}system\n${systemText}${IM_END}\n`);
    for (const m of nonSystem) {
        const text = extractText(m.content);
        if (m.role === 'user') {
            parts.push(`${IM_START}user\n${text}${IM_END}\n`);
        }
        else if (m.role === 'assistant') {
            parts.push(`${IM_START}assistant\n${text}${IM_END}\n`);
        }
        // tool roles are skipped — llama.cpp doesn't support them
    }
    // Open the assistant turn for generation
    parts.push(`${IM_START}assistant\n`);
    return parts.join('');
}
async function resolveQdrantCollection() {
    try {
        const res = await fetch(`${QDRANT_BASE}/collections`, {
            signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        const names = new Set((body.result?.collections ?? []).map((c) => c.name));
        for (const name of CODEX_COLLECTIONS) {
            if (names.has(name))
                return name;
        }
    }
    catch { /* Qdrant not running — RAG skipped */ }
    return null;
}
async function fetchCodexContext(query, collection) {
    // Keyword-based retrieval — no embedding model required.
    // Scrolls a sample from Qdrant and ranks by keyword overlap.
    try {
        const keywords = query
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 6);
        if (!keywords.length)
            return '';
        const res = await fetch(`${QDRANT_BASE}/collections/${collection}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 30, with_payload: true }),
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok)
            return '';
        const body = (await res.json());
        const points = body.result?.points ?? [];
        const scored = points.map((p) => {
            const haystack = [
                p.payload?.['title'],
                p.payload?.['name'],
                p.payload?.['machine_name'],
                p.payload?.['text'],
                p.payload?.['content'],
                p.payload?.['description'],
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            const hits = keywords.filter((k) => haystack.includes(k)).length;
            return { p, hits };
        });
        const top = scored
            .filter((s) => s.hits > 0)
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 3)
            .map((s) => s.p);
        if (!top.length)
            return '';
        const lines = ['--- Dirgha Codex Context (top matches) ---'];
        for (const hit of top) {
            const title = hit.payload?.['title'] ||
                hit.payload?.['name'] ||
                hit.payload?.['machine_name'] ||
                String(hit.id);
            const text = hit.payload?.['text'] ||
                hit.payload?.['content'] ||
                hit.payload?.['description'] ||
                '';
            lines.push(`\n[Codex: ${title}]`);
            if (text)
                lines.push(text.slice(0, 600));
        }
        lines.push('--- End Codex Context ---');
        return lines.join('\n');
    }
    catch {
        return '';
    }
}
// ── llama-cli streaming subprocess ────────────────────────────────────
// Tokens that llama-cli may emit at end-of-generation — strip from output.
const END_TOKENS = [IM_END, EOT, '<|im_start|>'];
async function* streamLlamaCli(llamaPath, ggufPath, prompt, signal, timeoutMs) {
    const args = [
        '-m', ggufPath,
        '-p', prompt,
        '--no-display-prompt',
        '--log-disable',
        '-n', '768',
        '--temp', '0.15',
        '--top-p', '0.9',
        '--repeat-penalty', '1.1',
        '-c', '4096',
    ];
    let proc;
    try {
        proc = spawn(llamaPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    }
    catch (err) {
        throw new ProviderError(`Failed to start llama-cli: ${err instanceof Error ? err.message : String(err)}`, 'machine1', 0, false);
    }
    // Collect stderr silently for error reporting
    const stderrChunks = [];
    proc.stderr?.on('data', (chunk) => stderrChunks.push(chunk));
    // Handle spawn errors (binary not on PATH, permission denied, etc.)
    // Using an object ref so TypeScript doesn't narrow the type via closure analysis.
    const spawnErrRef = { value: null };
    proc.on('error', (err) => { spawnErrRef.value = err; });
    // Kill on timeout or caller abort
    const timer = setTimeout(() => proc.kill('SIGTERM'), timeoutMs);
    if (signal) {
        signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
    }
    yield { type: 'text_start' };
    yield { type: 'text_delta', delta: '[Machine 1] ' };
    let outputTokens = 0;
    let outBuffer = '';
    let done = false;
    try {
        for await (const raw of proc.stdout) {
            if (spawnErrRef.value)
                break;
            outBuffer += raw.toString('utf8');
            // Find the earliest end token in the buffer
            let emitUpTo = outBuffer.length;
            for (const tok of END_TOKENS) {
                const idx = outBuffer.indexOf(tok);
                if (idx !== -1 && idx < emitUpTo) {
                    emitUpTo = idx;
                    done = true;
                }
            }
            if (emitUpTo > 0) {
                const text = outBuffer.slice(0, emitUpTo);
                yield { type: 'text_delta', delta: text };
                outputTokens += Math.ceil(text.length / 4);
            }
            // Retain tail to catch tokens spanning chunk boundaries (max token len ~14)
            outBuffer = done ? '' : outBuffer.slice(Math.max(0, emitUpTo - 16));
            if (done)
                break;
        }
    }
    finally {
        clearTimeout(timer);
        yield { type: 'text_end' };
        await new Promise((resolve) => {
            if (proc.exitCode !== null) {
                resolve();
                return;
            }
            proc.once('close', resolve);
        });
        if (outputTokens > 0) {
            yield { type: 'usage', inputTokens: 0, outputTokens };
        }
    }
    // Throw spawn error AFTER finally so it doesn't mask try-block exceptions.
    if (spawnErrRef.value) {
        throw new ProviderError(`llama-cli not found or not executable: ${spawnErrRef.value.message}. ` +
            'Install llama.cpp and add llama-cli to your PATH, or set LLAMA_CLI_PATH.', 'machine1', 0, false);
    }
}
// ── Provider class ────────────────────────────────────────────────────
export class Machine1Provider {
    id = 'machine1';
    timeoutMs;
    constructor(config) {
        // CPU inference is slow — default 3 minutes
        this.timeoutMs = config.timeoutMs ?? 180_000;
    }
    supportsTools(_modelId) {
        return false;
    }
    supportsThinking(_modelId) {
        return false;
    }
    stream(req) {
        return this._stream(req);
    }
    async *_stream(req) {
        // 1. Locate llama-cli binary
        const llamaPath = findBinary(LLAMA_CLI_CANDIDATES);
        if (!llamaPath) {
            throw new ProviderError('llama-cli not found. Install llama.cpp (https://github.com/ggerganov/llama.cpp) ' +
                'and ensure llama-cli is on your PATH, or set LLAMA_CLI_PATH=/path/to/llama-cli.', 'machine1', 0, false);
        }
        // 2. Locate the Machine 1 GGUF
        const ggufPath = findGguf(GGUF_CANDIDATES);
        if (!ggufPath) {
            throw new ProviderError('Machine 1 model not found. Place machine1-q4_k_m.gguf in ~/.dirgha/ ' +
                'or set MACHINE1_MODEL_PATH=/absolute/path/to/machine1.gguf.\n' +
                'Download: dirgha pull machine1  (or visit dirgha.ai/models)', 'machine1', 0, false);
        }
        // 3. Optional: retrieve Codex context from Qdrant
        let codexContext = '';
        const collection = await resolveQdrantCollection();
        if (collection) {
            const query = lastUserText(req.messages);
            if (query) {
                codexContext = await fetchCodexContext(query, collection);
            }
        }
        // 4. Build ChatML prompt
        const prompt = buildChatML(req.messages, codexContext);
        // 5. Stream via llama-cli subprocess
        yield* streamLlamaCli(llamaPath, ggufPath, prompt, req.signal, this.timeoutMs);
    }
}
//# sourceMappingURL=machine1.js.map