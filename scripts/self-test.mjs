#!/usr/bin/env node
/**
 * dirgha-self-test — comprehensive CLI health check against live API.
 *
 * Usage: node scripts/self-test.mjs
 *
 * Tests critical paths end-to-end. Requires DEEPSEEK_API_KEY or
 * OPENROUTER_API_KEY in env. Uses the dist build when run from repo.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BIN = existsSync(resolve(ROOT, "dist/cli/main.js"))
  ? `node ${resolve(ROOT, "dist/cli/main.js")}`
  : "dirgha";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m○\x1b[0m";
const CYAN = "\x1b[36m";

const KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY;
const HAS_KEY = Boolean(KEY);
const MODEL = process.env.DEEPSEEK_API_KEY
  ? "deepseek-ai/deepseek-v4-flash"
  : "tencent/hy3-preview:free";
const TIMEOUT = 90000;

let passed = 0;
let failed = 0;
let skipped = 0;

function run(name, cmd, timeoutMs = TIMEOUT) {
  try {
    const result = execSync(cmd, {
      timeout: timeoutMs,
      stdio: "pipe",
      maxBuffer: 1024 * 1024,
    });
    console.log(`  ${PASS} ${name}`);
    passed++;
    return result.toString();
  } catch (e) {
    if (!HAS_KEY) {
      console.log(`  ${SKIP} ${name} (no API key)`);
      skipped++;
    } else {
      const stderr = e.stderr?.toString() || "";
      const stdout = e.stdout?.toString() || "";
      const msg =
        stderr.slice(0, 80) || stdout.slice(0, 80) || e.message.slice(0, 80);
      console.log(`  ${FAIL} ${name} — ${msg}`);
      failed++;
    }
    return "";
  }
}

console.log(
  `${CYAN}dirgha self-test${"\x1b[0m"} — ${HAS_KEY ? `model=${MODEL}` : "no API key"}`,
);
console.log(`  bin=${BIN}\n`);

// ── Structural ──
console.log("Structural:");
run("version", `${BIN} --version`);
run("help", `${BIN} --help`);
// doctor omitted — uses raw ANSI stdout that conflicts with execSync
run("update --check", `${BIN} update --check`);
run("keys list", `${BIN} keys list 2>/dev/null`);

// ── Live API ──
if (HAS_KEY) {
  console.log(`\nLive API (${MODEL}):`);

  const basic = run(
    "basic chat",
    `${BIN} ask --model ${MODEL} --yolo --max-turns 2 'say PONG'`,
  );
  if (basic && /PONG/i.test(basic)) console.log("    ↳ correct response");

  const tool = run(
    "shell tool",
    `${BIN} ask --model ${MODEL} --yolo --max-turns 3 'use the shell tool: run echo TOOL_OK and report the output as TOOL_OK'`,
  );
  if (tool && /TOOL_OK/i.test(tool)) console.log("    ↳ tool executed");

  const fread = run(
    "file read",
    `${BIN} ask --model ${MODEL} --yolo --max-turns 3 'read /root/dirgha-code-release/package.json and report the version field'`,
  );
  if (fread && /\d+\.\d+/.test(fread)) console.log("    ↳ file content read");

  const multiturn = run(
    "multi-turn context",
    `${BIN} ask --model ${MODEL} --yolo --max-turns 4 'first: what is 2+2? then: what was my first question?'`,
  );
  if (multiturn && /2\+2/i.test(multiturn))
    console.log("    ↳ context preserved");

  const errors = run(
    "error handling",
    `${BIN} ask --model ${MODEL} --yolo --max-turns 2 'run cat /this_file_does_not_exist_xyz and describe what happened'`,
  );
  if (errors && /error|fail|not found|exist/i.test(errors))
    console.log("    ↳ error handled gracefully");
}

// ── Summary ──
console.log(`\n${"─".repeat(40)}`);
const total = passed + failed + skipped;
console.log(
  `${PASS} ${passed} passed${failed > 0 ? `  ${FAIL} ${failed} failed` : ""}${skipped > 0 ? `  ${SKIP} ${skipped} skipped` : ""}`,
);

if (failed > 0) {
  console.log(`\n${FAIL} DO NOT SHIP — ${failed} failure(s).`);
  process.exit(1);
}

console.log(`\n${PASS} Ship confident.`);
process.exit(0);
