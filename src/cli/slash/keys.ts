/**
 * /keys — list, set, or clear provider API keys persisted at
 * ~/.dirgha/keys.json. This is BYOK storage used by the setup wizard
 * and read on start-up so keys survive across shells without touching
 * ~/.bashrc. Values are masked on display.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SlashCommand } from "./types.js";

const KNOWN_PROVIDERS = [
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "FIREWORKS_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "CEREBRAS_API_KEY",
  "TOGETHER_API_KEY",
  "PERPLEXITY_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "ZAI_API_KEY",
  // SEAMLESS_KEY is reserved for future Seamless provider integration
];

interface KeyStore {
  [envVar: string]: string;
}

function keyPath(): string {
  return join(homedir(), ".dirgha", "keys.json");
}

async function read(): Promise<KeyStore> {
  const text = await readFile(keyPath(), "utf8").catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as KeyStore;
  } catch {
    return {};
  }
}

async function write(store: KeyStore): Promise<void> {
  const path = keyPath();
  await mkdir(join(homedir(), ".dirgha"), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2) + "\n", "utf8");
  try {
    await chmod(path, 0o600);
  } catch {
    /* non-POSIX */
  }
}

function mask(value: string): string {
  if (value.length < 10) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Probe the NVIDIA NIM API with a cheap, reliably-available model.
 * Uses meta/llama-3.3-70b-instruct — NOT kimi or minimax, which hang
 * with HTTP 000 on standard-tier NIM accounts (entitlement required).
 * Returns true on 200, "timeout" on AbortError, or an error string.
 */
async function verifyNvidiaKey(key: string): Promise<true | "timeout" | string> {
  try {
    const res = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 3,
          stream: false,
        }),
      },
    );
    if (res.ok) return true;
    const errText = await res.text().catch(() => "");
    return `HTTP ${res.status}${errText ? `: ${errText.slice(0, 80)}` : ""}`;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "TimeoutError" || e?.message?.includes("abort")) {
      return "timeout";
    }
    return e?.message ?? "unknown error";
  }
}

function usage(): string {
  return [
    "Usage:",
    "  /keys                        List stored keys (masked)",
    "  /keys set <ENV> <value>      Set a provider key",
    "  /keys clear <ENV>            Remove a key",
    "  /keys clear all              Remove every key",
    `Known ENV vars: ${KNOWN_PROVIDERS.join(", ")}`,
  ].join("\n");
}

export const keysCommand: SlashCommand = {
  name: "keys",
  description: "Manage BYOK API keys at ~/.dirgha/keys.json",
  async execute(args, ctx) {
    const [op, envVar, value] = args;
    const store = await read();

    if (!op || op === "list") {
      const all = new Set<string>([...KNOWN_PROVIDERS, ...Object.keys(store)]);
      const lines = ["Stored keys:"];
      for (const key of [...all].sort()) {
        const stored = store[key];
        const envInherit = process.env[key];
        const state = stored
          ? `stored  ${mask(stored)}`
          : envInherit
            ? `env     ${mask(envInherit)}`
            : "unset";
        lines.push(`  ${key.padEnd(22)}  ${state}`);
      }
      lines.push(`\nFile: ${keyPath()}`);
      return lines.join("\n");
    }

    if (op === "set") {
      if (!envVar) return `Missing argument.\n${usage()}`;
      if (!value) {
        ctx.requestKey(envVar);
        return `Paste your ${envVar} key below — no restart needed.`;
      }
      store[envVar] = value;
      await write(store);
      process.env[envVar] = value;

      // For NVIDIA keys, probe with a reliably-available model.
      // kimi-k2-instruct hangs (HTTP 000) on standard-tier NIM accounts.
      if (envVar === "NVIDIA_API_KEY" || envVar === "NVIDIA_API_KEY_2") {
        const verified = await verifyNvidiaKey(value);
        if (verified === true) {
          return `Stored ${envVar} (${mask(value)}). Key verified — NIM is reachable.`;
        } else if (verified === "timeout") {
          return `Stored ${envVar} (${mask(value)}). Key saved (could not verify — NVIDIA NIM timeout).`;
        } else {
          return `Stored ${envVar} (${mask(value)}). Warning: key check failed (${verified}). Key saved anyway.`;
        }
      }

      return `Stored ${envVar} (${mask(value)}).`;
    }

    if (op === "clear") {
      if (!envVar) return `Missing argument.\n${usage()}`;
      if (envVar === "all") {
        await write({});
        return "Cleared every stored key.";
      }
      if (!(envVar in store)) return `${envVar} is not set.`;
      delete store[envVar];
      await write(store);
      return `Cleared ${envVar}.`;
    }

    return `Unknown subcommand "${op}".\n${usage()}`;
  },
};
