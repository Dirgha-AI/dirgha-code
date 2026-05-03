/**
 * Startup health check hook — runs lightweight doctor checks once on
 * mount, cached for 24 hours. Non-blocking; emits a warning banner
 * if any check fails.
 */
import * as React from "react";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const STATE_PATH = join(homedir(), ".dirgha", "state.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
async function readState() {
    try {
        const raw = await readFile(STATE_PATH, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function writeState(state) {
    try {
        await mkdir(join(homedir(), ".dirgha"), { recursive: true });
        await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    }
    catch {
        /* best-effort */
    }
}
async function runHealthChecks() {
    const failures = [];
    // 1. Session store writable?
    try {
        const sessDir = join(homedir(), ".dirgha", "sessions");
        await mkdir(sessDir, { recursive: true });
        await access(sessDir, constants.W_OK);
    }
    catch {
        failures.push("session store not writable");
    }
    // 2. Memory store writable?
    try {
        const memDir = join(homedir(), ".dirgha", "memory");
        await mkdir(memDir, { recursive: true });
        await access(memDir, constants.W_OK);
    }
    catch {
        failures.push("memory store not writable");
    }
    // 3. Disk space >= 100MB? (approximate via statvfs-style check)
    try {
        const { execFileSync } = await import("node:child_process");
        const out = execFileSync("df", [
            "--block-size=1M",
            "--output=avail",
            homedir(),
        ]).toString();
        const lines = out.trim().split("\n");
        const availMb = parseInt(lines[1]?.trim() ?? "0", 10);
        if (!isNaN(availMb) && availMb < 100) {
            failures.push(`disk space low (${availMb}MB available)`);
        }
    }
    catch {
        /* df not available — skip */
    }
    // 4. At least one provider has a configured key?
    try {
        const keyEnvs = [
            "ANTHROPIC_API_KEY",
            "OPENAI_API_KEY",
            "GEMINI_API_KEY",
            "OPENROUTER_API_KEY",
            "NVIDIA_API_KEY",
            "FIREWORKS_API_KEY",
            "DEEPSEEK_API_KEY",
            "MISTRAL_API_KEY",
            "COHERE_API_KEY",
            "CEREBRAS_API_KEY",
            "TOGETHER_API_KEY",
            "PERPLEXITY_API_KEY",
            "XAI_API_KEY",
            "GROQ_API_KEY",
            "ZAI_API_KEY",
        ];
        const anyKey = keyEnvs.some((k) => !!process.env[k]);
        if (!anyKey) {
            failures.push("no provider API key configured");
        }
    }
    catch {
        failures.push("could not check provider keys");
    }
    return { allOk: failures.length === 0, failures };
}
export function useStartupHealth() {
    const [result, setResult] = React.useState(null);
    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const state = await readState();
                const last = state.lastHealthCheck ?? 0;
                if (Date.now() - last < CACHE_TTL_MS) {
                    return;
                }
                const health = await runHealthChecks();
                if (cancelled)
                    return;
                setResult(health);
                state.lastHealthCheck = Date.now();
                await writeState(state);
            }
            catch {
                /* best-effort */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return result;
}
//# sourceMappingURL=use-startup-health.js.map