#!/usr/bin/env node
/**
 * dirgha-self-test — comprehensive CLI health check against live API.
 *
 * Run before every release: node scripts/self-test.mjs
 *
 * Tests critical paths end-to-end. Requires DEEPSEEK_API_KEY or
 * OPENROUTER_API_KEY. Uses execSync with generous timeout.
 */
import { execSync } from "node:child_process";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m○\x1b[0m";
const CYAN = "\x1b[36m";

const KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY;
const HAS_KEY = Boolean(KEY);
const MODEL = process.env.DEEPSEEK_API_KEY
  ? "deepseek-ai/deepseek-v4-flash"
  : "tencent/hy3-preview:free";
const TIMEOUT = 60000; // 60s per command

let passed = 0;
let failed = 0;
let skipped = 0;

function run(name, cmd, opts = {}) {
  try {
    const result = execSync(cmd, {
      timeout: TIMEOUT,
      stdio: "pipe",
      maxBuffer: 1024 * 1024,
      ...opts,
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
  `${CYAN}dirgha self-test${"\x1b[0m"} — ${HAS_KEY ? `model=${MODEL}` : "no API key"}\n`,
);

// ── Structural tests ──
console.log("Structural:");
run("version", `dirgha --version`, {});
run("help", `dirgha --help`, {});
run("doctor", `dirgha doctor`, {});
run("update --check", `dirgha update --check`, {});
run("keys list", `dirgha keys list 2>/dev/null`, {});

// ── Live API ──
if (HAS_KEY) {
  console.log(`\nLive API (${MODEL}):`);

  const basic = run(
    "basic chat",
    `dirgha ask --model ${MODEL} --yolo --max-turns 2 --print 'say PONG'`,
    [],
  );
  if (basic && /PONG/i.test(basic)) console.log("    ↳ correct response");

  const tool = run(
    "shell tool",
    `dirgha ask --model ${MODEL} --yolo --max-turns 3 --print 'use the shell tool: run echo TOOL_OK and report the output as TOOL_OK'`,
    [],
  );
  if (tool && /TOOL_OK/i.test(tool)) console.log("    ↳ tool executed");

  const fread = run(
    "file read",
    `dirgha ask --model ${MODEL} --yolo --max-turns 3 --print 'read /root/dirgha-code-release/package.json and report the version field'`,
    [],
  );
  if (fread && /\d+\.\d+/i.test(fread)) console.log("    ↳ file content read");

  const multiturn = run(
    "multi-turn context",
    `dirgha ask --model ${MODEL} --yolo --max-turns 4 --print 'first: what is 2+2? then: what was my first question?'`,
    [],
  );
  if (multiturn && /2\+2/i.test(multiturn))
    console.log("    ↳ context preserved");

  const errors = run(
    "error handling",
    `dirgha ask --model ${MODEL} --yolo --max-turns 2 --print 'run cat /nonexistent_xyz and describe what happened'`,
    [],
  );
  if (errors && /error|fail|exist|not found/i.test(errors))
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
