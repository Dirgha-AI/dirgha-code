/**
 * /models — list every model from the provider catalogues grouped by
 * provider, mark which providers are configured (env var present), and
 * allow picking one as the current model for the REPL. Accepts either
 * a numeric index or a full `provider/model` id.
 */

import type { SlashCommand } from "./types.js";
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
import type { ModelDescriptor } from "../../providers/catalogue.js";
import { PRICES } from "../../intelligence/prices.js";

const ENV_FOR_PROVIDER: Record<string, string> = {
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

const PROVIDER_CATALOGUES: Array<{
  provider: string;
  models: ModelDescriptor[];
}> = [
  { provider: "anthropic", models: ANTHROPIC_CATALOGUE },
  { provider: "openai", models: OPENAI_CATALOGUE },
  { provider: "gemini", models: GEMINI_CATALOGUE },
  { provider: "nvidia", models: NIM_CATALOGUE as unknown as ModelDescriptor[] },
  { provider: "deepseek", models: DEEPSEEK_CATALOGUE },
  { provider: "xai", models: XAI_CATALOGUE },
  { provider: "groq", models: GROQ_CATALOGUE },
  { provider: "mistral", models: MISTRAL_CATALOGUE },
  { provider: "cohere", models: COHERE_CATALOGUE },
  { provider: "cerebras", models: CEREBRAS_CATALOGUE },
  { provider: "together", models: TOGETHER_CATALOGUE },
  { provider: "perplexity", models: PERPLEXITY_CATALOGUE },
];

const RECOMMENDED = new Set<string>([
  "deepseek-ai/deepseek-v4-pro",
  "deepseek-ai/deepseek-v4-flash",
  "moonshotai/kimi-k2.6",
  "claude-sonnet-4-6",
]);

interface CatalogueModel {
  id: string;
  provider: string;
  contextWindow: number;
  tools: boolean;
  thinkingMode: string;
  inputPerM: number;
  outputPerM: number;
  defaultModel?: boolean;
}

function configured(provider: string): boolean {
  const env = ENV_FOR_PROVIDER[provider] ?? "";
  return !env || Boolean(process.env[env]?.length);
}

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function thinkingLabel(mode: string): string {
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

function priceInline(inputPerM: number, outputPerM: number): string {
  if (inputPerM === 0 && outputPerM === 0) return "free";
  const input = inputPerM < 0.01 ? `<0.01` : `$${inputPerM.toFixed(2)}`;
  const output = outputPerM < 0.01 ? `<0.01` : `$${outputPerM.toFixed(2)}`;
  return `${input} / ${output}`;
}

function collectCatalogueModels(): CatalogueModel[] {
  const out: CatalogueModel[] = [];
  for (const cat of PROVIDER_CATALOGUES) {
    for (const m of cat.models) {
      if (m.deprecated) continue;
      const raw = m as unknown as { inputPerM?: number; outputPerM?: number };
      const priceEntry = PRICES.find(
        (p) => p.provider === cat.provider && p.model === m.id,
      );
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

function enrichCatalogue(): CatalogueModel[] {
  const byId = new Map<string, CatalogueModel>();
  for (const m of collectCatalogueModels()) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  for (const pp of PRICES) {
    if (byId.has(pp.model)) continue;
    byId.set(pp.model, {
      id: pp.model,
      provider: pp.provider,
      contextWindow: pp.contextWindow ?? 128_000,
      tools: pp.supportsTools !== false,
      thinkingMode: pp.supportsThinking ? "opt-in" : "none",
      inputPerM: pp.inputPerM,
      outputPerM: pp.outputPerM,
    });
  }
  return [...byId.values()];
}

export const modelsCommand: SlashCommand = {
  name: "models",
  description: "List models and optionally switch the current one",
  async execute(args, ctx) {
    const all = enrichCatalogue();
    const ordered = [...all];

    if (args.length > 0) {
      const first = args[0];
      if (/^\d+$/.test(first)) {
        const idx = Number.parseInt(first, 10) - 1;
        if (idx >= 0 && idx < ordered.length) {
          const chosen = ordered[idx];
          ctx.setModel(chosen.id);
          return `Model set to ${chosen.id} (${chosen.provider}).`;
        }
        return `Index out of range. There are ${ordered.length} models.`;
      }
      const match = ordered.find((p) => p.id === first);
      if (match) {
        ctx.setModel(match.id);
        return `Model set to ${match.id} (${match.provider}).`;
      }
      return `Invalid model: ${first}. Not found in the price catalogue. Use /models without arguments to browse.`;
    }

    const lines: string[] = [];
    lines.push(
      "  Rec  Model                          Provider     Context    Tools  Thinking    Price (in/out per 1M)",
    );
    lines.push(
      "  ───  ─────────────────────────────  ──────────  ─────────  ─────  ──────────  ──────────────────────",
    );

    const byProvider = new Map<string, CatalogueModel[]>();
    for (const row of ordered) {
      const bucket = byProvider.get(row.provider) ?? [];
      bucket.push(row);
      byProvider.set(row.provider, bucket);
    }

    let idx = 1;
    const sortedProviders = [...byProvider.keys()].sort((a, b) => {
      const ca = configured(a);
      const cb = configured(b);
      if (ca !== cb) return Number(cb) - Number(ca);
      return a.localeCompare(b);
    });

    for (const provider of sortedProviders) {
      const rows = byProvider.get(provider)!;
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

        lines.push(
          `  ${mark}${rec.padEnd(1)}${rec ? " " : "  "}${String(idx).padStart(2)}. ${row.id.padEnd(30)}${row.provider.padEnd(13)}${contextLabel(row.contextWindow).padEnd(10)}${toolsMark.padEnd(6)}${thinkingStr.padEnd(11)}${priceStr}`,
        );
        idx++;
      }
    }

    const configuredCount = sortedProviders.filter((p) => configured(p)).length;
    lines.push("");
    lines.push(
      `${configuredCount} of ${sortedProviders.length} providers configured. Pick with \`/models <number>\` or \`/models <model-id>\`.`,
    );

    return lines.join("\n");
  },
};
