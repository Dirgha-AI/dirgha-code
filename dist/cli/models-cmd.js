/**
 * `dirgha models` subcommand. Enumerates the model catalogue grouped
 * by provider, marking which providers are currently configured
 * (either via env var or a stored auth token).
 */
import { PRICES } from "../intelligence/prices.js";
import { style, defaultTheme } from "../tui/theme.js";
const ENV_FOR_PROVIDER = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    ollama: "",
};
export function runModels() {
    const rows = PRICES.map((p) => ({
        provider: p.provider,
        model: p.model,
        inputUsd: p.inputPerM === 0 ? "free" : `$${p.inputPerM.toFixed(2)}/M`,
        outputUsd: p.outputPerM === 0 ? "free" : `$${p.outputPerM.toFixed(2)}/M`,
        configured: isConfigured(p.provider),
    }));
    const byProvider = new Map();
    for (const row of rows) {
        const list = byProvider.get(row.provider) ?? [];
        list.push(row);
        byProvider.set(row.provider, list);
    }
    process.stdout.write(style(defaultTheme.accent, "\nModel catalogue\n"));
    for (const [provider, list] of byProvider) {
        const env = ENV_FOR_PROVIDER[provider] ?? "";
        const marker = list[0].configured
            ? style(defaultTheme.success, "configured")
            : style(defaultTheme.muted, env ? `set ${env} to enable` : "no key required");
        process.stdout.write(`\n${style(defaultTheme.userPrompt, provider)}  (${marker})\n`);
        for (const row of list) {
            process.stdout.write(`  ${row.model.padEnd(44)}  in ${row.inputUsd.padEnd(12)} out ${row.outputUsd}\n`);
        }
    }
    process.stdout.write("\nUse `-m <model>` on the command line or `/model <id>` inside the REPL.\n");
    return 0;
}
function isConfigured(provider) {
    const env = ENV_FOR_PROVIDER[provider] ?? "";
    return !env || Boolean(process.env[env]?.length);
}
//# sourceMappingURL=models-cmd.js.map