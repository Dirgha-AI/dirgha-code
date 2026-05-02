#!/usr/bin/env node
/**
 * Bundle size trending dashboard.
 *
 * Measures the current npm tarball size, appends it to a local trend file,
 * and prints a summary (today / 7-day delta / 30-day delta).
 *
 * Usage:
 *   node scripts/bundle-trend.mjs              # measure + append + print
 *   node scripts/bundle-trend.mjs --json       # JSON output for CI
 *   node scripts/bundle-trend.mjs --summary    # table only (no append)
 *
 * Trend file: /tmp/dirgha-bundle-trend.json (local; in CI it's uploaded
 * as an artifact with 90-day retention).
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TREND_FILE = "/tmp/dirgha-bundle-trend.json";

function measureSize() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  execSync("npm pack", { cwd: ROOT, stdio: "pipe" });
  const tarballs = execSync("ls -t dirgha-code-*.tgz", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const tarball = tarballs[0].trim();
  const stat = statSync(resolve(ROOT, tarball));
  execSync(`rm -f dirgha-code-*.tgz`, { cwd: ROOT, stdio: "pipe" });
  return {
    version: pkg.version,
    date: new Date().toISOString().slice(0, 10),
    timestamp: Date.now(),
    bytes: stat.size,
    kilobytes: Math.round((stat.size / 1024) * 10) / 10,
    megabytes: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
  };
}

function loadTrend() {
  if (!existsSync(TREND_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TREND_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTrend(data) {
  writeFileSync(TREND_FILE, JSON.stringify(data, null, 2));
}

function formatBytes(b) {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function formatDelta(current, previous) {
  if (!previous) return "--";
  const delta = current - previous;
  const pct = ((delta / previous) * 100).toFixed(1);
  const sign = delta > 0 ? "+" : "";
  if (Math.abs(delta) < 10) return "~0 B (0.0%)";
  return `${sign}${formatBytes(delta).replace(/^\+/, "")} (${sign}${pct}%)`;
}

function trendArrow(current, previous) {
  if (!previous) return "";
  const delta = current - previous;
  if (delta > 51200) return "↑↑";
  if (delta > 10240) return "↑";
  if (delta < -51200) return "↓↓";
  if (delta < -10240) return "↓";
  return "→";
}

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const summaryOnly = args.includes("--summary");

const entry = measureSize();

if (!summaryOnly) {
  const trend = loadTrend();
  trend.push(entry);
  saveTrend(trend);
}

const trend = loadTrend();
const todayIdx = trend.findIndex((e) => e.date === entry.date);
const previous = todayIdx > 0 ? trend[todayIdx - 1] : null;

const now = Date.now();
const sevenDaysAgo = trend.findLast((e) => e.timestamp < now - 7 * 86400_000);
const thirtyDaysAgo = trend.findLast((e) => e.timestamp < now - 30 * 86400_000);

if (jsonMode) {
  const report = {
    version: entry.version,
    date: entry.date,
    size: {
      bytes: entry.bytes,
      kilobytes: entry.kilobytes,
      megabytes: entry.megabytes,
      human: formatBytes(entry.bytes),
    },
    delta: {
      previous: previous
        ? { bytes: previous.bytes, delta_bytes: entry.bytes - previous.bytes }
        : null,
      sevenDays: sevenDaysAgo
        ? {
            bytes: sevenDaysAgo.bytes,
            delta_bytes: entry.bytes - sevenDaysAgo.bytes,
          }
        : null,
      thirtyDays: thirtyDaysAgo
        ? {
            bytes: thirtyDaysAgo.bytes,
            delta_bytes: entry.bytes - thirtyDaysAgo.bytes,
          }
        : null,
    },
    history: trend.slice(-90),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(0);
}

// ── pretty-print ──
const R = "\x1b[31m";
const G = "\x1b[32m";
const B = "\x1b[34m";
const Y = "\x1b[33m";
const N = "\x1b[0m";

console.log("");
console.log(`${B}═══ Bundle Size Trending Dashboard ═══${N}`);
console.log("");
console.log(`  Version:    ${Y}${entry.version}${N}`);
console.log(`  Date:       ${entry.date}`);
console.log(
  `  Size:       ${Y}${formatBytes(entry.bytes)}${N} (${entry.bytes.toLocaleString()} bytes)`,
);
console.log("");

if (previous) {
  const delta = entry.bytes - previous.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs previous: ${color}${formatDelta(entry.bytes, previous.bytes)}${N} ${trendArrow(entry.bytes, previous.bytes)}`,
  );
} else {
  console.log(`  vs previous: (first entry)`);
}

if (sevenDaysAgo) {
  const delta = entry.bytes - sevenDaysAgo.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs 7 days:   ${color}${formatDelta(entry.bytes, sevenDaysAgo.bytes)}${N}`,
  );
}

if (thirtyDaysAgo) {
  const delta = entry.bytes - thirtyDaysAgo.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs 30 days:  ${color}${formatDelta(entry.bytes, thirtyDaysAgo.bytes)}${N}`,
  );
}

console.log("");
if (trend.length >= 3) {
  const recent = trend.slice(-7);
  const sizes = recent.map((e) => e.bytes);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  const points = recent
    .map((e) => {
      const bar = e.bytes === max ? "█" : e.bytes === min ? "▁" : "▒";
      return `  ${e.date.slice(5)} ${bar} ${formatBytes(e.bytes)}`;
    })
    .join("\n");
  console.log(`${B}  Recent trend:${N}`);
  console.log(points);
  console.log("");
}

console.log(`  Entries in history: ${trend.length}`);
console.log(`  Trend file: ${TREND_FILE}`);
console.log("");
console.log(`${B}═══ Bundle Size Trending Dashboard ═══${N}`);
console.log("");
console.log(`  Version:    ${Y}${entry.version}${N}`);
console.log(`  Date:       ${entry.date}`);
console.log(
  `  Size:       ${Y}${formatBytes(entry.bytes)}${N} (${entry.bytes.toLocaleString()} bytes)`,
);
console.log("");

if (previous) {
  const delta = entry.bytes - previous.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs previous: ${color}${formatDelta(entry.bytes, previous.bytes)}${N} ${trendArrow(entry.bytes, previous.bytes)}`,
  );
} else {
  console.log(`  vs previous: (first entry)`);
}

if (sevenDaysAgo) {
  const delta = entry.bytes - sevenDaysAgo.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs 7 days:   ${color}${formatDelta(entry.bytes, sevenDaysAgo.bytes)}${N}`,
  );
}

if (thirtyDaysAgo) {
  const delta = entry.bytes - thirtyDaysAgo.bytes;
  const color = delta < 0 ? G : delta > 10240 ? R : Y;
  console.log(
    `  vs 30 days:  ${color}${formatDelta(entry.bytes, thirtyDaysAgo.bytes)}${N}`,
  );
}

console.log("");
if (trend.length >= 3) {
  const recent = trend.slice(-7);
  const sizes = recent.map((e) => e.bytes);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  const points = recent
    .map((e, i) => {
      const bar = e.bytes === max ? "█" : e.bytes === min ? "▁" : "▒";
      return `  ${e.date.slice(5)} ${bar} ${formatBytes(e.bytes)}`;
    })
    .join("\n");
  console.log(`${B}  Recent trend:${N}`);
  console.log(points);
  console.log("");
}

console.log(`  Entries in history: ${trend.length}`);
console.log(`  Trend file: ${TREND_FILE}`);
console.log("");
