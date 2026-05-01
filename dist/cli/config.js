/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { migrateDeprecatedModel } from "../intelligence/prices.js";
export const DEFAULT_CONFIG = {
    model: "moonshotai/kimi-k2.6",
    cheapModel: "meta/llama-3.1-8b-instruct",
    summaryModel: "moonshotai/kimi-k2.5",
    maxTurns: 16,
    showThinking: false,
    autoApproveTools: ["fs_read", "fs_ls", "search_grep", "search_glob", "git"],
    skills: { enabled: true },
    smartRoute: { enabled: false },
    compaction: { triggerTokens: 120_000, preserveLastTurns: 6 },
    telemetry: { enabled: false },
};
export async function loadConfig(cwd = process.cwd()) {
    const userPath = join(homedir(), ".dirgha", "config.json");
    const projectPath = join(cwd, ".dirgha", "config.json");
    const userPartial = await readJson(userPath);
    const projectPartial = await readJson(projectPath);
    const envPartial = readEnvOverrides();
    const merged = merge(DEFAULT_CONFIG, userPartial, projectPartial, envPartial);
    // Migrate any model IDs the upstream provider has dropped, so users
    // with stale `~/.dirgha/config.json` don't 400 on every call.
    merged.model = migrateDeprecatedModel(merged.model);
    merged.cheapModel = migrateDeprecatedModel(merged.cheapModel);
    merged.summaryModel = migrateDeprecatedModel(merged.summaryModel);
    return merged;
}
async function readJson(path) {
    const text = await readFile(path, "utf8").catch(() => undefined);
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
function readEnvOverrides() {
    const out = {};
    if (process.env.DIRGHA_MODEL)
        out.model = process.env.DIRGHA_MODEL;
    if (process.env.DIRGHA_CHEAP_MODEL)
        out.cheapModel = process.env.DIRGHA_CHEAP_MODEL;
    if (process.env.DIRGHA_MAX_TURNS)
        out.maxTurns = Number.parseInt(process.env.DIRGHA_MAX_TURNS, 10);
    if (process.env.DIRGHA_SHOW_THINKING === "1")
        out.showThinking = true;
    return out;
}
function merge(...partials) {
    const out = structuredClone(DEFAULT_CONFIG);
    for (const p of partials) {
        if (!p)
            continue;
        for (const key of Object.keys(p)) {
            const value = p[key];
            if (value === undefined)
                continue;
            if (typeof value === "object" && !Array.isArray(value)) {
                out[key] = {
                    ...out[key],
                    ...value,
                };
            }
            else {
                out[key] = value;
            }
        }
    }
    return out;
}
//# sourceMappingURL=config.js.map