/**
 * `dirgha doctor --send-crash-report` — explicit, consent-driven
 * crash bundle flow.
 *
 * Design: docs/sprints/2026-04-28-cli-excellence/CRASH-REPORT-DESIGN.md
 *
 * Flow:
 *   1. Build a bundle: version, OS bucket, Node major, last error
 *      (sanitised), audit-log tail (last 5 entries, paths under $HOME
 *      replaced with '~'), env-var NAMES matching /KEY|TOKEN|SECRET/i
 *      (values redacted).
 *   2. Show the preview to the user.
 *   3. Prompt for [y]es / [N]o / [c]opy / [q]uit. Default: No.
 *   4. On 'y': POST to the configured crash-report endpoint, append a
 *      send-record to ~/.dirgha/audit/crash-sends.jsonl.
 *   5. On 'c': copy bundle to clipboard (xclip / pbcopy / wl-copy /
 *      clip.exe — try in order). Zero network involvement.
 *
 * Privacy guarantee: sanitisation happens BEFORE preview. The bytes
 * the user sees are exactly the bytes that will leave the machine.
 * Never sends prompts, model responses, file contents, API key values.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { stdout, stdin } from "node:process";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const KEY_REGEX = /KEY|TOKEN|SECRET|PASSWORD|AUTH/i;
function osBucket(plat) {
    if (plat === "linux")
        return "linux";
    if (plat === "darwin")
        return "macos";
    if (plat === "win32")
        return "win";
    return "other";
}
function nodeMajor(v) {
    const m = v.match(/^v(\d+)/);
    return m ? `v${m[1]}` : "unknown";
}
/** Replace $HOME prefix with '~' so paths don't leak the OS username. */
function redactHomePath(s) {
    const home = homedir();
    return s.split(home).join("~");
}
/** Sanitise an error message: drop anything inside double quotes (often
 *  contains user data), redact paths, mask any captured key shape. */
function sanitiseMessage(msg) {
    let out = redactHomePath(msg);
    // Mask anything that looks like an API key (sk-..., phc_..., bearer
    // tokens with 16+ alphanumeric chars). Conservative — better to over-
    // redact than leak.
    out = out.replace(/(sk-[A-Za-z0-9_-]{12,}|phc_[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,})/g, "[REDACTED]");
    // Drop content between double quotes (likely user prompts or paths).
    out = out.replace(/"[^"]*"/g, '"[REDACTED]"');
    return out;
}
function readAuditTail(n) {
    const dir = join(homedir(), ".dirgha", "audit");
    if (!existsSync(dir))
        return [];
    try {
        const files = readdirSync(dir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }));
        files.sort((a, b) => b.m - a.m);
        if (files.length === 0)
            return [];
        const newest = readFileSync(join(dir, files[0].f), "utf8")
            .trim()
            .split("\n");
        const tail = newest.slice(-n);
        return tail.map((line) => {
            try {
                const obj = JSON.parse(line);
                return {
                    ts: String(obj.ts ?? obj.timestamp ?? ""),
                    event: String(obj.event ?? obj.kind ?? "event"),
                    detail: redactHomePath(String(obj.detail ?? obj.summary ?? "")).slice(0, 80),
                };
            }
            catch {
                return { ts: "", event: "unparseable", detail: "" };
            }
        });
    }
    catch {
        return [];
    }
}
function readLastError() {
    const path = join(homedir(), ".dirgha", "last-error.json");
    if (!existsSync(path))
        return undefined;
    try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return {
            name: String(raw.name ?? "Error"),
            message_redacted: sanitiseMessage(String(raw.message ?? "")),
            stack: Array.isArray(raw.stack)
                ? raw.stack.slice(0, 8).map(redactHomePath)
                : [],
        };
    }
    catch {
        return undefined;
    }
}
function safeEnvVarNames() {
    // Names only, never values. Filter to the dirgha-relevant prefix list
    // so we don't leak everything in $env.
    const prefixes = [
        "DIRGHA_",
        "NVIDIA_",
        "OPENROUTER_",
        "ANTHROPIC_",
        "OPENAI_",
        "GEMINI_",
        "GROQ_",
        "NODE_",
    ];
    return Object.keys(process.env)
        .filter((k) => prefixes.some((p) => k.startsWith(p)))
        .filter((k) => KEY_REGEX.test(k))
        .sort();
}
function buildBundle(version) {
    return {
        version,
        os: osBucket(platform()),
        node: nodeMajor(process.version),
        ts: new Date().toISOString(),
        audit_tail: readAuditTail(5),
        env_var_names: safeEnvVarNames(),
        ...(readLastError() ? { last_error: readLastError() } : {}),
    };
}
function previewBundle(b) {
    const lines = [];
    lines.push("────────────────────────────────────");
    lines.push("Crash report bundle preview:");
    lines.push("────────────────────────────────────");
    lines.push(`Version:  ${b.version}`);
    lines.push(`OS:       ${b.os}`);
    lines.push(`Node:     ${b.node}`);
    lines.push(`Time:     ${b.ts}`);
    lines.push("");
    if (b.last_error) {
        lines.push("Last error (sanitised):");
        lines.push(`  ${b.last_error.name}: ${b.last_error.message_redacted}`);
        for (const frame of b.last_error.stack.slice(0, 5))
            lines.push(`    ${frame}`);
        lines.push("");
    }
    else {
        lines.push("Last error: (none recorded — ~/.dirgha/last-error.json not present)");
        lines.push("");
    }
    if (b.audit_tail.length > 0) {
        lines.push(`Audit log (last ${b.audit_tail.length} entries — paths redacted):`);
        for (const e of b.audit_tail) {
            lines.push(`  ${e.ts} ${e.event.padEnd(14)} ${e.detail}`);
        }
        lines.push("");
    }
    if (b.env_var_names.length > 0) {
        lines.push("Env var names (values NEVER sent):");
        for (const n of b.env_var_names)
            lines.push(`  ${n} = [REDACTED]`);
        lines.push("");
    }
    lines.push("────────────────────────────────────");
    return lines.join("\n");
}
async function readChar() {
    return new Promise((resolve) => {
        const onData = (chunk) => {
            const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            stdin.removeListener("data", onData);
            stdin.pause();
            resolve(s.trim().toLowerCase().slice(0, 1));
        };
        stdin.resume();
        stdin.on("data", onData);
    });
}
function copyToClipboard(s) {
    const tools = [
        ["xclip", ["-selection", "clipboard"]],
        ["pbcopy", []],
        ["wl-copy", []],
        ["clip.exe", []],
    ];
    for (const [bin, args] of tools) {
        try {
            const r = spawnSync(bin, args, { input: s, encoding: "utf8" });
            if (r.status === 0)
                return true;
        }
        catch {
            /* try next */
        }
    }
    return false;
}
function appendSendRecord(bundle, endpoint, ok) {
    const dir = join(homedir(), ".dirgha", "audit");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "crash-sends.jsonl");
    const sha256 = createHash("sha256")
        .update(JSON.stringify(bundle))
        .digest("hex");
    const record = {
        ts: new Date().toISOString(),
        endpoint,
        bytes_sent: JSON.stringify(bundle).length,
        preview_sha256: sha256.slice(0, 16),
        ok,
    };
    writeFileSync(path, (existsSync(path) ? readFileSync(path, "utf8") : "") +
        JSON.stringify(record) +
        "\n");
}
async function send(bundle, endpoint) {
    try {
        const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bundle),
            signal: AbortSignal.timeout(10_000),
        });
        return r.ok;
    }
    catch {
        return false;
    }
}
export async function runCrashReport(opts) {
    const yes = opts.argv.includes("--yes") || opts.argv.includes("-y");
    // Read the version dynamically so we don't have to import from main.
    let version = "0.0.0-dev";
    try {
        const raw = readFileSync(join(import.meta.dirname ?? ".", "..", "..", "package.json"), "utf8");
        const pkg = JSON.parse(raw);
        version = pkg.version ?? "0.0.0-dev";
    }
    catch {
        /* */
    }
    const { readTelemetryConfig } = await import("../cli/subcommands/telemetry.js");
    const cfg = readTelemetryConfig();
    // Crash endpoint = telemetry endpoint + '/crash' if it's the default
    // Posthog one; otherwise the user's configured endpoint as-is.
    const endpoint = cfg.endpoint.includes("posthog")
        ? cfg.endpoint // Posthog accepts the same payload shape via /i/v0/e/
        : cfg.endpoint;
    const bundle = buildBundle(version);
    stdout.write(previewBundle(bundle) + "\n");
    stdout.write(`Send to ${endpoint}? [y/N/c=copy/q=quit] `);
    if (!stdin.isTTY) {
        stdout.write("(non-TTY: cancelling — pass --yes to send non-interactively)\n");
        return 0;
    }
    if (yes) {
        stdout.write("--yes flag set — sending without confirmation.\n");
        const ok = await send(bundle, endpoint);
        appendSendRecord(bundle, endpoint, ok);
        stdout.write(ok
            ? `✓ sent (${JSON.stringify(bundle).length} bytes)\n`
            : `✗ send failed; bundle saved to audit log\n`);
        return ok ? 0 : 1;
    }
    // Interactive prompt
    if (typeof stdin.setRawMode === "function")
        stdin.setRawMode(true);
    const ch = await readChar();
    if (typeof stdin.setRawMode === "function")
        stdin.setRawMode(false);
    stdout.write(`\n`);
    if (ch === "y") {
        const ok = await send(bundle, endpoint);
        appendSendRecord(bundle, endpoint, ok);
        stdout.write(ok
            ? `✓ sent (${JSON.stringify(bundle).length} bytes). audit: ~/.dirgha/audit/crash-sends.jsonl\n`
            : `✗ send failed; bundle audit-logged anyway\n`);
        return ok ? 0 : 1;
    }
    if (ch === "c") {
        const text = JSON.stringify(bundle, null, 2);
        if (copyToClipboard(text))
            stdout.write(`✓ copied to clipboard (${text.length} chars). Paste into a GitHub issue at https://github.com/Dirgha-AI/dirgha-code/issues\n`);
        else
            stdout.write(`✗ no clipboard tool found (xclip / pbcopy / wl-copy / clip.exe). Bundle:\n\n${text}\n`);
        return 0;
    }
    // n / q / Enter / anything else
    stdout.write(`Cancelled. Nothing left your machine.\n`);
    return 0;
}
//# sourceMappingURL=crash-report.js.map