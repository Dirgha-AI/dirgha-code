/**
 * /models — list every model from the provider catalogues grouped by
 * provider, mark which providers are configured (env var present), and
 * allow picking one as the current model for the REPL. Accepts either
 * a numeric index or a full `provider/model` id.
 */
import { DEEPSEEK_CATALOGUE } from "../../providers/deepseek-catalogue.js";
import { ANTHROPIC_CATALOGUE } from "../../providers/anthropic-catalogue.js";
import { OPENAI_CATALOGUE } from "../../providers/openai-catalogue.js";
import { NIM_CATALOGUE } from "../../providers/nim-catalogue.js";
import { XAI_CATALOGUE } from "../../providers/xai-catalogue.js";
import { GEMINI_CATALOGUE } from "../../providers/gemini-catalogue.js";
import { GROQ_CATALOGUE } from "../../providers/groq-catalogue.js";
import { MISTRAL_CATALOGUE } from "../../providers/mistral-catalogue.js";
import { COHERE_CATALOGUE } from "../../providers/cohere-catalogue.js";
import { CEREBRAS_CATALOGUE } from "../../providers/cerebras-catalogue.js";
import { TOGETHER_CATALOGUE } from "../../providers/together-catalogue.js";
import { PERPLEXITY_CATALOGUE } from "../../providers/perplexity-catalogue.js";
import { PRICES } from "../../intelligence/prices.js";
const ENV_FOR_PROVIDER = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    mistral: "MISTRAL_API_KEY",
    cohere: "COHERE_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    together: "TOGETHER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    xai: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    ollama: "",
    llamacpp: "",
};
const PROVIDER_CATALOGUES = [
    { provider: "anthropic", models: ANTHROPIC_CATALOGUE },
    { provider: "openai", models: OPENAI_CATALOGUE },
    { provider: "gemini", models: GEMINI_CATALOGUE },
    { provider: "nvidia", models: NIM_CATALOGUE },
    { provider: "deepseek", models: DEEPSEEK_CATALOGUE },
    { provider: "xai", models: XAI_CATALOGUE },
    { provider: "groq", models: GROQ_CATALOGUE },
    { provider: "mistral", models: MISTRAL_CATALOGUE },
    { provider: "cohere", models: COHERE_CATALOGUE },
    { provider: "cerebras", models: CEREBRAS_CATALOGUE },
    { provider: "together", models: TOGETHER_CATALOGUE },
    { provider: "perplexity", models: PERPLEXITY_CATALOGUE },
];
const RECOMMENDED = new Set([
    "deepseek-ai/deepseek-v4-pro",
    "deepseek-ai/deepseek-v4-flash",
    "moonshotai/kimi-k2.6",
    "claude-sonnet-4-6",
]);
function configured(provider) {
    const env = ENV_FOR_PROVIDER[provider] ?? "";
    return !env || Boolean(process.env[env]?.trim().length);
}
function contextLabel(tokens) {
    if (tokens >= 1_000_000)
        return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
    if (tokens >= 1_000)
        return `${Math.round(tokens / 1000)}K`;
    return String(tokens);
}
function thinkingLabel(mode) {
    switch (mode) {
        case "always-on":
            return "always-on";
        case "default-on":
            return "default-on";
        case "opt-in":
            return "opt-in";
        case "none":
            return "none";
        default:
            return mode;
    }
}
function priceInline(inputPerM, outputPerM) {
    if (inputPerM === 0 && outputPerM === 0)
        return "free";
    const input = inputPerM < 0.01 ? `<0.01` : `$${inputPerM.toFixed(2)}`;
    const output = outputPerM < 0.01 ? `<0.01` : `$${outputPerM.toFixed(2)}`;
    return `${input} / ${output}`;
}
function collectCatalogueModels() {
    const out = [];
    for (const cat of PROVIDER_CATALOGUES) {
        for (const m of cat.models) {
            if (m.deprecated)
                continue;
            const raw = m;
            const priceEntry = PRICES.find((p) => p.provider === cat.provider && p.model === m.id);
            out.push({
                id: m.id,
                provider: cat.provider,
                contextWindow: m.contextWindow,
                tools: m.tools,
                thinkingMode: m.thinkingMode,
                inputPerM: raw.inputPerM ?? priceEntry?.inputPerM ?? 0,
                outputPerM: raw.outputPerM ?? priceEntry?.outputPerM ?? 0,
                defaultModel: m.defaultModel,
            });
        }
    }
    return out;
}
function enrichCatalogue() {
    const byId = new Map();
    for (const m of collectCatalogueModels()) {
        if (!byId.has(m.id))
            byId.set(m.id, m);
    }
    for (const pp of PRICES) {
        if (byId.has(pp.model))
            continue;
        byId.set(pp.model, {
            id: pp.model,
            provider: pp.provider,
            contextWindow: pp.contextWindow ?? 128_000,
            tools: pp.supportsTools === true,
            thinkingMode: pp.supportsThinking ? "opt-in" : "none",
            inputPerM: pp.inputPerM,
            outputPerM: pp.outputPerM,
        });
    }
    return [...byId.values()];
}
const KNOWN_PREFIXES = [
    "anthropic.",
    "openai.",
    "google/",
    "gemini-",
    "nvidia.",
    "deepseek.",
    "mistral.",
    "cohere.",
    "cerebras.",
    "together.",
    "perplexity.",
    "xai-",
    "groq.",
    "ollama.",
    "llamacpp.",
];
// Explicit vendor→provider map for vendor/model-style IDs.
// These vendors' models live on NVIDIA NIM (or another specific provider)
// and would otherwise fall through to openrouter incorrectly.
const VENDOR_TO_PROVIDER = {
    "deepseek-ai": "nvidia",
    "moonshotai": "nvidia",
    "qwen": "nvidia",
    "mistralai": "nvidia",
    "meta": "nvidia",
    "nvidia": "nvidia",
    "nv-mistralai": "nvidia",
    "google": "gemini",
    "openai": "openai",
    "anthropic": "anthropic",
    "cohere": "cohere",
    "mistral": "mistral",
};
function detectProvider(id) {
    if (id.endsWith(":free"))
        return "openrouter";
    if (id.includes("/")) {
        const vendor = id.split("/")[0].toLowerCase();
        if (VENDOR_TO_PROVIDER[vendor])
            return VENDOR_TO_PROVIDER[vendor];
        const lower = id.toLowerCase();
        for (const prefix of KNOWN_PREFIXES) {
            if (lower.startsWith(prefix)) {
                return prefix.replace(/[.\-/]/g, "");
            }
        }
        return "openrouter";
    }
    for (const prefix of KNOWN_PREFIXES) {
        if (id.toLowerCase().startsWith(prefix)) {
            return prefix.replace(/[.\-/]/g, "");
        }
    }
    return "openrouter";
}
async function testModel(id) {
    const provider = detectProvider(id);
    const envKey = ENV_FOR_PROVIDER[provider];
    const apiKey = envKey ? process.env[envKey]?.trim() : undefined;
    if (!apiKey) {
        const needed = envKey ?? "OPENROUTER_API_KEY";
        return `⚠ Cannot test model — ${needed} is not set. Use /keys set ${needed} <key> first.`;
    }
    const start = performance.now();
    let url;
    let body;
    let headers;
    if (provider === "openrouter") {
        url = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://openrouter.ai",
            "X-Title": "Dirgha",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "openai") {
        url = "https://api.openai.com/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "anthropic") {
        url = "https://api.anthropic.com/v1/messages";
        headers = {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
        };
    }
    else if (provider === "gemini") {
        const geminiModel = id.replace(/^google\//, "");
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${apiKey}`;
        headers = { "Content-Type": "application/json" };
        body = {
            contents: [{ role: "user", parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 },
        };
    }
    else if (provider === "deepseek") {
        url = "https://api.deepseek.com/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "groq") {
        url = "https://api.groq.com/openai/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "mistral") {
        url = "https://api.mistral.ai/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "cohere") {
        url = "https://api.cohere.ai/v1/chat";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            message: "hi",
            max_tokens: 1,
        };
    }
    else if (provider === "nvidia") {
        url = "https://integrate.api.nvidia.com/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "cerebras") {
        url = "https://api.cerebras.ai/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "together") {
        url = "https://api.together.xyz/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "xai") {
        url = "https://api.x.ai/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else if (provider === "perplexity") {
        url = "https://api.perplexity.ai/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    else {
        // Unknown provider — try OpenRouter as default
        url = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://openrouter.ai",
            "X-Title": "Dirgha",
        };
        body = {
            model: id,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
        };
    }
    try {
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        const elapsed = Math.round(performance.now() - start);
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            let detail;
            try {
                const json = JSON.parse(text);
                detail = json.error?.message ?? json.detail ?? text;
            }
            catch {
                detail = text || res.statusText;
            }
            return `❌ Model test failed (${elapsed}ms) — ${res.status} ${res.statusText}\n${detail}`;
        }
        return `✅ Model "${id}" responded successfully in ${elapsed}ms.`;
    }
    catch (err) {
        const elapsed = Math.round(performance.now() - start);
        const msg = err instanceof Error ? err.message : String(err);
        return `❌ Model test error (${elapsed}ms) — ${msg}`;
    }
}
export const modelsCommand = {
    name: "models",
    aliases: ["mod"],
    description: "List models and optionally switch the current one",
    async execute(args, ctx) {
        const all = enrichCatalogue();
        const ordered = [...all];
        if (args.length > 0) {
            const first = args[0];
            // "test" subcommand
            if (first === "test") {
                if (args.length < 2) {
                    return "Usage: /models test <model-id>";
                }
                const testId = args.slice(1).join(" ");
                return testModel(testId);
            }
            // "search" subcommand
            if (first === "search") {
                if (args.length < 2) {
                    return "Usage: /models search <query>";
                }
                const query = args.slice(1).join(" ");
                const apiKey = process.env.OPENROUTER_API_KEY?.trim();
                if (!apiKey) {
                    return "⚠ OPENROUTER_API_KEY is not set. Use /keys set OPENROUTER_API_KEY <key> first to search models.";
                }
                try {
                    const res = await fetch("https://openrouter.ai/api/v1/models", {
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                        },
                    });
                    if (!res.ok) {
                        return `Failed to fetch models: ${res.status} ${res.statusText}`;
                    }
                    const json = await res.json();
                    const models = json.data ?? [];
                    const lowerQ = query.toLowerCase();
                    const filtered = models
                        .filter((m) => m.id.toLowerCase().includes(lowerQ))
                        .slice(0, 15);
                    if (filtered.length === 0) {
                        return `No models found matching "${query}".`;
                    }
                    const lines = [];
                    lines.push(`  ${"ID".padEnd(42)}  ${"Context".padEnd(10)}  ${"Prompt/1M tokens"}`);
                    lines.push(`  ${"─".repeat(42)}  ${"─".repeat(10)}  ${"─".repeat(16)}`);
                    for (const m of filtered) {
                        const ctxStr = m.context_length
                            ? contextLabel(m.context_length)
                            : "—";
                        const priceStr = m.pricing?.prompt ?? "—";
                        lines.push(`  ${m.id.padEnd(42)}  ${ctxStr.padEnd(10)}  ${priceStr}`);
                    }
                    return lines.join("\n");
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return `Search failed: ${msg}`;
                }
            }
            if (/^\d+$/.test(first)) {
                const idx = Number.parseInt(first, 10) - 1;
                if (idx >= 0 && idx < ordered.length) {
                    const chosen = ordered[idx];
                    await ctx.setModel(chosen.id);
                    return `Model set to ${chosen.id} (${chosen.provider}).`;
                }
                return `Index out of range. There are ${ordered.length} models.`;
            }
            const match = ordered.find((p) => p.id === first);
            if (match) {
                await ctx.setModel(match.id);
                return `Model set to ${match.id} (${match.provider}).`;
            }
            // Unknown model ID — set it anyway and detect the provider
            const provider = detectProvider(first);
            const envKey = ENV_FOR_PROVIDER[provider];
            const keySet = envKey ? Boolean(process.env[envKey]?.trim().length) : true;
            await ctx.setModel(first);
            if (keySet) {
                return `Model set to ${first} via ${provider}.\nNote: not in catalogue — no pricing data.`;
            }
            else {
                return `Model set to ${first} via ${provider}.\nNote: not in catalogue — no pricing data.\n⚠ Set ${envKey ?? "OPENROUTER_API_KEY"} first: /keys set ${envKey ?? "OPENROUTER_API_KEY"} <key>`;
            }
        }
        const lines = [];
        lines.push("  Rec  Model                          Provider     Context    Tools  Thinking    Price (in/out per 1M)");
        lines.push("  ───  ─────────────────────────────  ──────────  ─────────  ─────  ──────────  ──────────────────────");
        const byProvider = new Map();
        for (const row of ordered) {
            const bucket = byProvider.get(row.provider) ?? [];
            bucket.push(row);
            byProvider.set(row.provider, bucket);
        }
        let idx = 1;
        const sortedProviders = [...byProvider.keys()].sort((a, b) => {
            const ca = configured(a);
            const cb = configured(b);
            if (ca !== cb)
                return Number(cb) - Number(ca);
            return a.localeCompare(b);
        });
        for (const provider of sortedProviders) {
            const rows = byProvider.get(provider);
            const env = ENV_FOR_PROVIDER[provider] ?? "";
            const marker = configured(provider)
                ? "configured"
                : env
                    ? `set ${env} to enable`
                    : "no key required";
            lines.push("");
            lines.push(`  ${provider} (${marker})`);
            for (const row of rows) {
                const mark = row.id === ctx.model ? "*" : " ";
                const rec = RECOMMENDED.has(row.id) ? "⭐" : "";
                const toolsMark = row.tools ? "✓" : "—";
                const thinkingStr = thinkingLabel(row.thinkingMode);
                const priceStr = priceInline(row.inputPerM, row.outputPerM);
                lines.push(`  ${mark}${rec.padEnd(1)}${rec ? " " : "  "}${String(idx).padStart(2)}. ${row.id.padEnd(30)}${row.provider.padEnd(13)}${contextLabel(row.contextWindow).padEnd(10)}${toolsMark.padEnd(6)}${thinkingStr.padEnd(11)}${priceStr}`);
                idx++;
            }
        }
        const configuredCount = sortedProviders.filter((p) => configured(p)).length;
        lines.push("");
        lines.push(`${configuredCount} of ${sortedProviders.length} providers configured. Pick with \`/models <number>\` or \`/models <model-id>\`.`);
        return lines.join("\n");
    },
};
//# sourceMappingURL=models.js.map