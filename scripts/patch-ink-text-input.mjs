#!/usr/bin/env node
/**
 * Patch ink-text-input to clamp cursor offset on every value change.
 *
 * Without this fix, the cursor offset is only clamped when it overshoots
 * the end of the value. External value changes (paste expand/collapse,
 * history recall, focus regain) leave the cursor at a stale position,
 * causing subsequent keystrokes to land in the wrong location.
 *
 * The patch replaces the cursor-clamping useEffect to always clamp
 * cursorOffset to the current value length via Math.min, not just when
 * it exceeds value.length - 1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const target = join(
  __dirname,
  "..",
  "node_modules",
  "ink-text-input",
  "build",
  "index.js",
);

const expected =
  "const clampedOffset = Math.min(previousState.cursorOffset, newValue.length);";
const patchApplied =
  "clampedOffset !== previousState.cursorOffset || previousState.cursorOffset > newValue.length - 1";

try {
  const src = readFileSync(target, "utf8");
  if (src.includes(patchApplied)) {
    process.exit(0); // already patched
  }

  const oldCode = `            if (previousState.cursorOffset > newValue.length - 1) {
                return {
                    cursorOffset: newValue.length,
                    cursorWidth: 0,
                };`;

  const newCode = `            const clampedOffset = Math.min(previousState.cursorOffset, newValue.length);
            if (clampedOffset !== previousState.cursorOffset || previousState.cursorOffset > newValue.length - 1) {
                return {
                    cursorOffset: clampedOffset,
                    cursorWidth: 0,
                };`;

  if (!src.includes(oldCode)) {
    // Maybe already patched? Check for newCode.
    if (src.includes("clampedOffset")) {
      process.exit(0);
    }
    console.error("[patch-ink-text-input] unexpected source — aborting");
    process.exit(1);
  }

  writeFileSync(target, src.replace(oldCode, newCode), "utf8");
  console.log("[patch-ink-text-input] applied");
} catch (err) {
  // Fail gracefully in environments without ink-text-input (e.g. test runners
  // that mock it). The cursor fix is a quality-of-life improvement, not a
  // correctness requirement — builds continue without it.
  if (err.code === "ENOENT") {
    console.warn("[patch-ink-text-input] ink-text-input not found — skipping");
    process.exit(0);
  }
  console.error("[patch-ink-text-input] failed:", err.message);
  process.exit(1);
}
