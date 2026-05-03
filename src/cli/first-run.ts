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
  "XAI_API_KEY",
  "ZAI_API_KEY",
] as const;

const KEYSTORE_PATH = join(homedir(), ".dirgha", "keys.json");

export function checkFirstRun(): boolean {
  if (existsSync(KEYSTORE_PATH)) {
    try {
      const raw = readFileSync(KEYSTORE_PATH, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const hasEntry = Object.values(parsed).some(
          (v) => typeof v === "string" && v.trim().length > 0,
        );
        if (hasEntry) return false;
      }
    } catch {
      // corrupt keys.json — treat as first run
    }
  }

  for (const key of ENV_KEYS) {
    const val = process.env[key];
    if (val && val.trim().length > 0) return false;
  }

  return true;
}

// Key-by-prefix detection so users can paste any common key format.
const KEY_PREFIXES: Record<string, { name: string; url: string }> = {
  "sk-or-v1": { name: "OpenRouter", url: "https://openrouter.ai/keys" },
  "sk-ant": { name: "Anthropic", url: "https://console.anthropic.com" },
  "sk-proj": { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  "sk-": {
    name: "OpenAI / DeepSeek",
    url: "https://platform.deepseek.com/api_keys",
  },
  "nvapi-": {
    name: "NVIDIA NIM (free)",
    url: "https://build.nvidia.com/settings/api-keys",
  },
  gsk_: { name: "Gemini / Groq", url: "https://aistudio.google.com/apikey" },
};

export async function showWelcomeWizard(): Promise<void> {
  const B = "\x1b[1m";
  const C = "\x1b[36m";
  const G = "\x1b[32m";
  const Y = "\x1b[33m";
  const R = "\x1b[0m";

  stdout.write(`\n`);
  stdout.write(`  ${B}◆  DIRGHA CODE${R}\n`);
  stdout.write(`\n`);
  stdout.write(`  ${B}Welcome!${R} Paste an API key to get started.\n`);
  stdout.write(`\n`);
  stdout.write(`  ${C}Quick start options:${R}\n`);
  stdout.write(
    `  ${G}OpenRouter${R} (200+ models): ${C}https://openrouter.ai/keys${R}\n`,
  );
  stdout.write(
    `  ${G}NVIDIA NIM${R} (free tier):    ${C}https://build.nvidia.com${R}\n`,
  );
  stdout.write(
    `  ${G}DeepSeek${R} (cheap + fast):    ${C}https://platform.deepseek.com${R}\n`,
  );
  stdout.write(`\n`);
  stdout.write(`  Paste your key below (or press Enter to skip):\n`);
  stdout.write(`  > `);

  const rl = createInterface({ input: stdin, output: stdout });
  const key = await new Promise<string>((resolve) => {
    rl.once("line", (line) => {
      rl.close();
      resolve(line.trim());
    });
  });

  if (key.length === 0) {
    stdout.write(
      `\n  ${Y}Skipped.${R} Run ${C}dirgha${R} and use ${Y}/keys set${R} to add a key later.\n`,
    );
    stdout.write(
      `  Free models available: ${C}/model tencent/hy3-preview:free${R}\n\n`,
    );
    return;
  }

  // Auto-detect provider from key prefix.
  const envVar = detectProviderFromKey(key);
  await saveKey(envVar, key);

  stdout.write(`\n  ${G}Key saved${R} as ${B}${envVar}${R}.\n`);
  stdout.write(`  Starting Dirgha with a free model...\n\n`);

  // Set a recommended free starting model so the first chat works immediately.
  if (!process.env["DIRGHA_MODEL"]) {
    process.env["DIRGHA_MODEL"] = "deepseek-ai/deepseek-v4-flash";
  }
}

function detectProviderFromKey(key: string): string {
  for (const [prefix, info] of Object.entries(KEY_PREFIXES)) {
    if (key.startsWith(prefix)) {
      if (info.name === "OpenRouter") return "OPENROUTER_API_KEY";
      if (info.name === "Anthropic") return "ANTHROPIC_API_KEY";
      if (info.name === "OpenAI / DeepSeek") return "DEEPSEEK_API_KEY";
      if (info.name.includes("NVIDIA")) return "NVIDIA_API_KEY";
      if (info.name.includes("Gemini / Groq")) return "GEMINI_API_KEY";
      break;
    }
  }
  return "OPENROUTER_API_KEY"; // default fallback
}
