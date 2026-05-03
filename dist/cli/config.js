/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { migrateDeprecatedModel } from "../intelligence/prices.js";
const CURRENT_SCHEMA = 1;
export const DEFAULT_CONFIG = {
    schemaVersion: CURRENT_SCHEMA,
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
    kbAutoInject: true,
    alternateBuffer: true,
};
export async function loadConfig(cwd = process.cwd()) {
    const userPath = join(homedir(), ".dirgha", "config.json");
    const projectPath = join(cwd, ".dirgha", "config.json");
    const userPartial = await readJson(userPath);
    const projectPartial = await readJson(projectPath);
    const envPartial = readEnvOverrides();
    const merged = merge(DEFAULT_CONFIG, userPartial, projectPartial, envPartial);
    validate(merged);
    migrateConfigSchema(merged);
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
        process.stderr.write(`[dirgha] Warning: ${path} contains malformed JSON — using defaults.\n`);
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
    const modeEnv = process.env.DIRGHA_MODE;
    if (modeEnv &&
        ["plan", "act", "yolo", "verify", "ask"].includes(modeEnv)) {
        out.mode = modeEnv;
    }
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
            if (typeof value === "object" &&
                value !== null &&
                !Array.isArray(value)) {
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
function validate(cfg) {
    if (!Number.isFinite(cfg.maxTurns) || cfg.maxTurns < 1) {
        cfg.maxTurns = 1;
    }
    if (!Number.isFinite(cfg.compaction.triggerTokens) ||
        cfg.compaction.triggerTokens < 1000) {
        cfg.compaction.triggerTokens = 1000;
    }
    if (!Number.isFinite(cfg.compaction.preserveLastTurns) ||
        cfg.compaction.preserveLastTurns < 1) {
        cfg.compaction.preserveLastTurns = 1;
    }
    if (!cfg.model || cfg.model.trim() === "") {
        process.stderr.write("[dirgha] warn: model is empty; LLM calls will fail\n");
    }
}
function migrateConfigSchema(cfg) {
    if (cfg.schemaVersion === CURRENT_SCHEMA)
        return;
    // Future migrations go here. Example:
    // if (cfg.schemaVersion === undefined || cfg.schemaVersion < 2) {
    //   // v1 → v2: rename field, add default
    // }
    cfg.schemaVersion = CURRENT_SCHEMA;
}
//# sourceMappingURL=config.js.map