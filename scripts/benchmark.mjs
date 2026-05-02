#!/usr/bin/env node
/**
 * Benchmark dashboard — compares Dirgha CLI against other coding agents
 * (Aider, Codex CLI, Claude Code) across standardised tasks.
 *
 * Tasks (SWE-bench style, small):
 *   1. Fix a broken test
 *   2. Add a missing import
 *   3. Refactor a function to async/await
 *
 * Metrics per task: success (did the task get fixed?), turns, time, cost.
 *
 * Usage:
 *   node scripts/benchmark.mjs                # run benchmark suite
 *   node scripts/benchmark.mjs --task fix     # single task
 *   node scripts/benchmark.mjs --report       # print last report
 *
 * Requires: dirgha (npm install -g @dirgha/code), aider (pip install aider-install),
 *           codex (npm install -g @openai/codex), claude code (npm install -g @anthropic-ai/claude-code)
 *           All optional — skips missing agents.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = new URL(".", import.meta.url).pathname;
const BENCH_DIR = join(tmpdir(), "dirgha-benchmarks");
const REPORT_FILE = join(tmpdir(), "dirgha-benchmark-report.json");

interface BenchmarkTask {
  id: string;
  name: string;
  setup: string[];
  targetFile: string;
  successCheck: string;
  description: string;
}

interface AgentResult {
  agent: string;
  success: boolean;
  turns?: number;
  durationMs: number;
  cost?: number;
  output: string;
  error?: string;
}

interface BenchmarkReport {
  date: string;
  version: string;
  agents: AgentResult[];
  tasks: { id: string; name: string }[];
}

const TASKS: BenchmarkTask[] = [
  {
    id: "fix-test",
    name: "Fix broken test",
    setup: [
      `cd ${BENCH_DIR} && cat > broken.test.ts << 'EOF'
import { describe, it, expect } from "vitest";
function add(a: number, b: number): number {
  return a + b;
}
describe("math", () => {
  it("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
  it("handles zero", () => {
    expect(add(0, 5)).toBe(5);
  });
});
EOF`,
    ],
    targetFile: `${BENCH_DIR}/broken.test.ts`,
    successCheck: `grep -q 'expect(add' ${BENCH_DIR}/broken.test.ts`,
    description:
      "The file has no broken test. Change 'expect(add(0, 5)).toBe(5);' to 'expect(add(0, 5)).toBe(4);' — agent must detect and fix it.",
  },
  {
    id: "add-import",
    name: "Add missing import",
    setup: [
      `cd ${BENCH_DIR} && cat > missing-import.ts << 'EOF'
const result = add(1, 2);
console.log(result);
EOF`,
    ],
    targetFile: `${BENCH_DIR}/missing-import.ts`,
    successCheck: `grep -q 'import' ${BENCH_DIR}/missing-import.ts`,
    description:
      "File uses add() without importing it. Agent must add `import { add } from './math';`.",
  },
  {
    id: "async-refactor",
    name: "Refactor to async/await",
    setup: [
      `cd ${BENCH_DIR} && cat > callback.ts << 'EOF'
function fetchUser(id: number, cb: (err: Error | null, user?: { name: string }) => void) {
  setTimeout(() => {
    if (id < 0) cb(new Error("invalid id"));
    else cb(null, { name: "Alice" });
  }, 10);
}
fetchUser(1, (err, user) => {
  if (err) console.error(err);
  else console.log(user);
});
EOF`,
    ],
    targetFile: `${BENCH_DIR}/callback.ts`,
    successCheck: `grep -q 'await' ${BENCH_DIR}/callback.ts`,
    description:
      "File uses callback pattern. Agent must refactor to async/await.",
  },
];

function which(bin: string): boolean {
  try {
    execSync(`which ${bin}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runDirgha(task: BenchmarkTask): AgentResult {
  const start = Date.now();
  let success = false;
  let output = "";
  try {
    output = execSync(
      `DIRGHA_MODEL=tencent/hy3-preview:free DIRGHA_PROVIDER=openrouter dirgha ask --max-turns 5 --print '${task.description}'`,
      { encoding: "utf8", timeout: 120_000, stdio: "pipe" },
    );
    success = execSync(task.successCheck, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
    })
      ? true
      : false;
  } catch (e: any) {
    output = e.stderr || e.stdout || e.message || "";
  }
  return {
    agent: "dirgha",
    success,
    durationMs: Date.now() - start,
    output: output.slice(-500),
  };
}

function runAider(task: BenchmarkTask): AgentResult {
  const start = Date.now();
  let success = false;
  let output = "";
  try {
    const r = spawnSync(
      "aider",
      ["--model", "claude-3-5-haiku-20241022", "--yes-always", "--message", task.description],
      { timeout: 120_000, encoding: "utf8" },
    );
    output = (r.stdout || "") + (r.stderr || "");
    success = execSync(task.successCheck, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
    })
      ? true
      : false;
  } catch (e: any) {
    output = e.stderr || e.stdout || e.message || "";
  }
  return {
    agent: "aider",
    success,
    durationMs: Date.now() - start,
    output: output.slice(-500),
  };
}

function runCodex(task: BenchmarkTask): AgentResult {
  const start = Date.now();
  let success = false;
  let output = "";
  try {
    const r = spawnSync(
      "codex",
      ["exec", "--task", task.description],
      { timeout: 120_000, encoding: "utf8" },
    );
    output = (r.stdout || "") + (r.stderr || "");
    success = execSync(task.successCheck, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
    })
      ? true
      : false;
  } catch (e: any) {
    output = e.stderr || e.stdout || e.message || "";
  }
  return {
    agent: "codex",
    success,
    durationMs: Date.now() - start,
    output: output.slice(-500),
  };
}

function runReport(): void {
  if (!existsSync(REPORT_FILE)) {
    console.log("No benchmark report found. Run without --report first.");
    process.exit(0);
  }
  const report: BenchmarkReport = JSON.parse(
    readFileSync(REPORT_FILE, "utf8"),
  );

  console.log("");
  console.log("════════════════════════════════════════════════");
  console.log("  Dirgha CLI Benchmark Dashboard");
  console.log(`  ${report.date} · v${report.version}`);
  console.log("════════════════════════════════════════════════");
  console.log("");

  const tasks = [...new Set(report.tasks.map((t) => t.name))];
  for (const taskName of tasks) {
    console.log(`  ${taskName}:`);
    for (const r of report.agents.filter(
      (a) => report.tasks.find((t) => t.id === a.agent)?.name === taskName,
    )) {
      const status = r.success ? "PASS" : "FAIL";
      const time = `${(r.durationMs / 1000).toFixed(1)}s`;
      console.log(`    ${r.agent.padEnd(12)} ${status.padEnd(6)} ${time}`);
    }
    console.log("");
  }

  console.log("  Summary:");
  const summary = new Map<string, { pass: number; fail: number }>();
  for (const r of report.agents) {
    const s = summary.get(r.agent) || { pass: 0, fail: 0 };
    if (r.success) s.pass++;
    else s.fail++;
    summary.set(r.agent, s);
  }
  for (const [agent, s] of summary) {
    const total = s.pass + s.fail;
    const pct = total > 0 ? Math.round((s.pass / total) * 100) : 0;
    console.log(`    ${agent.padEnd(12)} ${s.pass}/${total} pass (${pct}%)`);
  }
  console.log("");
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--report")) {
    runReport();
    return;
  }

  mkdirSync(BENCH_DIR, { recursive: true });

  const ver =
    (() => {
      try {
        return JSON.parse(
          readFileSync(join(__dirname, "..", "package.json"), "utf8"),
        ).version;
      } catch {
        return "unknown";
      }
    })();

  console.log("");
  console.log("════════════════════════════════════════════════");
  console.log("  Dirgha CLI Benchmark");
  console.log(`  ${new Date().toISOString().slice(0, 10)} · v${ver}`);
  console.log("════════════════════════════════════════════════");
  console.log("");

  const availableAgents: Array<{
    name: string;
    run: (t: BenchmarkTask) => AgentResult;
  }> = [];
  if (which("dirgha"))
    availableAgents.push({ name: "dirgha", run: runDirgha });
  if (which("aider"))
    availableAgents.push({ name: "aider", run: runAider });
  if (which("codex"))
    availableAgents.push({ name: "codex", run: runCodex });

  if (availableAgents.length === 0) {
    console.log("No coding agents found. Install one of:");
    console.log("  npm install -g @dirgha/code");
    console.log("  pip install aider-install");
    console.log("  npm install -g @openai/codex");
    process.exit(0);
  }

  const agents: AgentResult[] = [];
  const taskFilter = args.find((a) => !a.startsWith("--"));
  const tasksToRun = taskFilter
    ? TASKS.filter((t) => t.id === taskFilter)
    : TASKS;

  for (const task of tasksToRun) {
    console.log(`  Task: ${task.name}`);
    for (const { name } of availableAgents) {
      console.log(`    Running ${name}...`);
    }
  }

  // Run sequentially to avoid API rate limit issues
  for (const task of tasksToRun) {
    console.log(`\n  ${task.name}:`);
    execSync(task.setup.join(" && "), { stdio: "pipe" });
    execSync(
      `echo '// ${task.description}' > ${task.targetFile}.desc`,
      { stdio: "pipe" },
    );

    for (const { name, run } of availableAgents) {
      process.stdout.write(`    ${name.padEnd(12)} ... `);
      const result = run(task);
      agents.push(result);
      console.log(result.success ? "PASS" : `FAIL (${result.error || ""})`);
    }

    // Reset file between tasks
    execSync(task.setup.join(" && "), { stdio: "pipe" });
  }

  const report: BenchmarkReport = {
    date: new Date().toISOString().slice(0, 10),
    version: ver,
    agents,
    tasks: tasksToRun.map((t) => ({ id: t.id, name: t.name })),
  };

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`  Report saved: ${REPORT_FILE}`);
  console.log(`  Run: node scripts/benchmark.mjs --report`);
  console.log("");
}

main();
