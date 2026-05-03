/**
 * First-run detection and interactive key setup.
 *
 * If no API key is found, shows an interactive wizard that lets the user
 * paste a key immediately (no restart needed). After saving, launches the
 * TUI with a recommended free model so the first chat works in < 30 seconds.
 *
 * Also detects: OpenRouter free tokens, NVIDIA free tier, environment vars.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { stdout, stdin } from "node:process";
import { createInterface } from "node:readline";
import { saveKey } from "../auth/keystore.js";
import { defaultTheme, style } from "../tui/theme.js";
const ENV_KEYS = [
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "NVIDIA_API_KEY",
    "GEMINI_API_KEY",
    "FIREWORKS_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
    "COHERE_API_KEY",
    "CEREBRAS_API_KEY",
    "TOGETHER_API_KEY",
    "PERPLEXITY_API_KEY",
    "XAI_API_KEY",
    "ZAI_API_KEY",
];
const KEYSTORE_PATH = join(homedir(), ".dirgha", "keys.json");
export function checkFirstRun() {
    if (existsSync(KEYSTORE_PATH)) {
        try {
            const raw = readFileSync(KEYSTORE_PATH, "utf8");
            if (raw.trim()) {
                const parsed = JSON.parse(raw);
                const hasEntry = Object.values(parsed).some((v) => typeof v === "string" && v.trim().length > 0);
                if (hasEntry)
                    return false;
            }
        }
        catch {
            // corrupt keys.json — treat as first run
        }
    }
    for (const key of ENV_KEYS) {
        const val = process.env[key];
        if (val && val.trim().length > 0)
            return false;
    }
    return true;
}
// Key-by-prefix detection so users can paste any common key format.
const KEY_PREFIXES = {
    "sk-or-v1": { name: "OpenRouter", url: "https://openrouter.ai/keys" },
    "sk-ant": { name: "Anthropic", url: "https://console.anthropic.com" },
    "sk-proj": { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
    "sk-": {
        name: "OpenAI",
        url: "https://platform.openai.com/api-keys",
    },
    "nvapi-": {
        name: "NVIDIA NIM (free)",
        url: "https://build.nvidia.com/settings/api-keys",
    },
    gsk_: { name: "Gemini", url: "https://aistudio.google.com/apikey" },
    fw_: {
        name: "Fireworks",
        url: "https://fireworks.ai/account/api-keys",
    },
    mLzHL: {
        name: "Mistral",
        url: "https://console.mistral.ai/api-keys",
    },
    "coa-": {
        name: "Cohere",
        url: "https://dashboard.cohere.com/api-keys",
    },
};
export async function showWelcomeWizard() {
    const T = defaultTheme;
    const bold = (s) => style(T.accent, s);
    const accent = (s) => style(T.accent, s);
    const success = (s) => style(T.success, s);
    const warning = (s) => style(T.warning, s);
    stdout.write(`\n`);
    stdout.write(`  ${bold("◆  DIRGHA CODE")}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${bold("Welcome!")} Paste an API key to get started.\n`);
    stdout.write(`\n`);
    stdout.write(`  ${accent("Quick start options:")}\n`);
    stdout.write(`  ${success("OpenRouter")} (200+ models): ${accent("https://openrouter.ai/keys")}\n`);
    stdout.write(`  ${success("NVIDIA NIM")} (free tier):    ${accent("https://build.nvidia.com")}\n`);
    stdout.write(`  ${success("DeepSeek")} (cheap + fast):    ${accent("https://platform.deepseek.com")}\n`);
    stdout.write(`\n`);
    stdout.write(`  Paste your key below (or press Enter to skip):\n`);
    stdout.write(`  > `);
    const rl = createInterface({ input: stdin, output: stdout });
    const key = await new Promise((resolve) => {
        rl.once("line", (line) => {
            rl.close();
            resolve(line.trim());
        });
    });
    if (key.length === 0) {
        stdout.write(`\n  ${warning("Skipped.")} Run ${accent("dirgha")} and use ${success("/keys set")} to add a key later.\n`);
        stdout.write(`  Free models available: ${accent("/model tencent/hy3-preview:free")}\n\n`);
        return;
    }
    // Auto-detect provider from key prefix.
    const envVar = detectProviderFromKey(key);
    await saveKey(envVar, key);
    stdout.write(`\n  ${success("Key saved")} as ${bold(envVar)}.\n`);
    stdout.write(`  Starting Dirgha with a free model...\n\n`);
}
function detectProviderFromKey(key) {
    for (const [prefix, info] of Object.entries(KEY_PREFIXES)) {
        if (key.startsWith(prefix)) {
            if (info.name === "OpenRouter")
                return "OPENROUTER_API_KEY";
            if (info.name === "Anthropic")
                return "ANTHROPIC_API_KEY";
            if (info.name === "OpenAI")
                return "OPENAI_API_KEY";
            if (info.name.includes("NVIDIA"))
                return "NVIDIA_API_KEY";
            if (info.name === "Gemini")
                return "GEMINI_API_KEY";
            if (info.name === "Fireworks")
                return "FIREWORKS_API_KEY";
            if (info.name === "Mistral")
                return "MISTRAL_API_KEY";
            if (info.name === "Cohere")
                return "COHERE_API_KEY";
            break;
        }
    }
    return "OPENROUTER_API_KEY"; // default fallback
}
//# sourceMappingURL=first-run.js.map