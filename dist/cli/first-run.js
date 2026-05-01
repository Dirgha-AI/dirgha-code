/**
 * First-run detection and welcome wizard.
 *
 * When no provider API keys are configured (no keys.json entries, no
 * env vars), shows a friendly wizard that guides new users through
 * their options. Designed to be the very first thing the CLI does on
 * a new install before anything else.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { stdout } from "node:process";
const ENV_KEYS = [
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "NVIDIA_API_KEY",
    "GEMINI_API_KEY",
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
export async function showWelcomeWizard() {
    const B = "\x1b[1m";
    const C = "\x1b[36m";
    const G = "\x1b[32m";
    const Y = "\x1b[33m";
    const M = "\x1b[35m";
    const R = "\x1b[0m";
    stdout.write(`\n`);
    stdout.write(`${G}    ╭─────────────────────────────────────────╮${R}\n`);
    stdout.write(`${G}    │${R}                                         ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗  ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗ ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ██║  ██║██║██████╔╝██║  ███╗███████║███████║ ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║ ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║ ${G}│${R}\n`);
    stdout.write(`${G}    │${R}   ${C} ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ${G}│${R}\n`);
    stdout.write(`${G}    │${R}                                         ${G}│${R}\n`);
    stdout.write(`${G}    ╰─────────────────────────────────────────╯${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${B}Welcome to Dirgha!${R} Let's get you coding.\n`);
    stdout.write(`\n`);
    stdout.write(`  ${B}Choose a provider to get started:${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${M}A)${R} OpenRouter — one key, 200+ models (easiest)\n`);
    stdout.write(`       → Get key: ${C}https://openrouter.ai/keys${R}\n`);
    stdout.write(`       → Then run: ${Y}/keys set OPENROUTER_API_KEY <your-key>${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${M}B)${R} NVIDIA NIM — free models, no credit card\n`);
    stdout.write(`       → Get key: ${C}https://build.nvidia.com/settings/api-keys${R}\n`);
    stdout.write(`       → Then run: ${Y}/keys set NVIDIA_API_KEY <your-key>${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${M}C)${R} Anthropic/OpenAI/DeepSeek — bring your own\n`);
    stdout.write(`       → Run: ${Y}dirgha setup${R} (interactive wizard)\n`);
    stdout.write(`\n`);
    stdout.write(`  ${M}D)${R} Start with free models (no key needed)\n`);
    stdout.write(`       → ${Y}/model tencent/hy3-preview:free${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  ${G}Tip:${R} keys persist in ${C}~/.dirgha/keys.json${R}\n`);
    stdout.write(`\n`);
    stdout.write(`  Type '${B}dirgha${R}' again or set a key to get started.\n`);
    stdout.write(`\n`);
}
//# sourceMappingURL=first-run.js.map