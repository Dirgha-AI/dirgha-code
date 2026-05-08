/**
 * /sandbox — explicit toggle for tool-execution containment.
 *
 * Modes:
 *   off    — current behaviour. Tools run with user privileges.
 *   auto   — shell/git/lsp confined to cwd via the platform sandbox
 *            adapter (bwrap on Linux, sandbox-exec on macOS, JobObject
 *            on Windows). Network allowed (npm, git pull, pip install
 *            still work).
 *   strict — same fs confinement plus network ban. Catches network
 *            exfiltration and `curl ... | sh` style attacks.
 *
 * fs-* tools and search-glob still run inline JS today and are not
 * affected by this setting (path-allowlist work is queued for a
 * follow-up release).
 *
 * Persists to `~/.dirgha/config.json`. Live toggle takes effect on
 * the next tool call without restarting dirgha.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const MODES = ["off", "auto", "strict"];
function configPath() {
    return join(homedir(), ".dirgha", "config.json");
}
async function readConfig() {
    const text = await readFile(configPath(), "utf8").catch(() => "");
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
async function writeConfig(cfg) {
    await mkdir(join(homedir(), ".dirgha"), { recursive: true });
    await writeFile(configPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
function describe(mode) {
    switch (mode) {
        case "off":
            return "off — tools run with user privileges (default)";
        case "auto":
            return "auto — shell/git/lsp confined to cwd; network allowed";
        case "strict":
            return "strict — cwd-only writes + network blocked";
    }
}
export const sandboxCommand = {
    name: "sandbox",
    description: "View or change tool sandbox mode (off | auto | strict). Affects shell/git/lsp; fs-* tools unsandboxed today.",
    async execute(args, ctx) {
        const current = ctx.getSandbox();
        if (args.length === 0) {
            return [
                `Current sandbox mode: ${current}`,
                ``,
                `Modes:`,
                ...MODES.map((m) => `  ${m === current ? "▸" : " "} ${describe(m)}`),
                ``,
                `Switch with /sandbox <mode>  ·  e.g. /sandbox auto`,
                ``,
                `Note: fs-read/fs-write/fs-edit/search-glob still run unsandboxed`,
                `      regardless of this setting (path-allowlist work in progress).`,
            ].join("\n");
        }
        const next = args[0];
        if (!MODES.includes(next)) {
            return [
                `Unknown sandbox mode "${next}".`,
                `Valid: ${MODES.join(" · ")}`,
            ].join("\n");
        }
        const cfg = await readConfig();
        cfg.sandbox = next;
        await writeConfig(cfg);
        ctx.setSandbox(next);
        return `Sandbox mode → ${next}. ${describe(next)}. Applies to the next tool call.`;
    },
};
//# sourceMappingURL=sandbox.js.map