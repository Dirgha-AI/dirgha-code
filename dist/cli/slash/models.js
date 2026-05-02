/**
 * /models — list every model in the v2 price catalogue grouped by
 * provider, mark which providers are configured (env var present), and
 * allow picking one as the current model for the REPL. Accepts either
 * a numeric index or a full `provider/model` id.
 */
import { PRICES } from "../../intelligence/prices.js";
const ENV_FOR_PROVIDER = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    ollama: "",
    llamacpp: "",
};
function priceText(value) {
    return value === 0 ? "free" : `$${value.toFixed(2)}/M`;
}
function configured(provider) {
    const env = ENV_FOR_PROVIDER[provider];
    if (!env)
        return true;
    return Boolean(process.env[env] && process.env[env].length > 0);
}
export const modelsCommand = {
    name: "models",
    description: "List models and optionally switch the current one",
    async execute(args, ctx) {
        const ordered = [...PRICES];
        if (args.length > 0) {
            const first = args[0];
            if (/^\d+$/.test(first)) {
                const idx = Number.parseInt(first, 10) - 1;
                if (idx >= 0 && idx < ordered.length) {
                    const chosen = ordered[idx];
                    ctx.setModel(chosen.model);
                    return `Model set to ${chosen.model} (${chosen.provider}).`;
                }
                return `Index out of range. There are ${ordered.length} models.`;
            }
            const match = ordered.find((p) => p.model === first);
            if (match) {
                ctx.setModel(match.model);
                return `Model set to ${match.model} (${match.provider}).`;
            }
            return `Invalid model: ${first}. Not found in the price catalogue. Use /models without arguments to browse.`;
        }
        const lines = ["Model catalogue (current: " + ctx.model + "):"];
        let i = 1;
        const byProvider = new Map();
        for (const row of ordered) {
            const bucket = byProvider.get(row.provider) ?? [];
            bucket.push(row);
            byProvider.set(row.provider, bucket);
        }
        for (const [provider, rows] of byProvider) {
            const env = ENV_FOR_PROVIDER[provider] ?? "";
            const marker = configured(provider)
                ? "configured"
                : env
                    ? `set ${env} to enable`
                    : "no key required";
            lines.push(`\n${provider} (${marker})`);
            for (const row of rows) {
                const mark = row.model === ctx.model ? "*" : " ";
                lines.push(`  ${mark} ${String(i).padStart(2)}. ${row.model.padEnd(42)}  in ${priceText(row.inputPerM).padEnd(10)} out ${priceText(row.outputPerM)}`);
                i++;
            }
        }
        lines.push("\nPick with `/models <number>` or `/models <model-id>`.");
        return lines.join("\n");
    },
};
//# sourceMappingURL=models.js.map