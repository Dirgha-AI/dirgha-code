/**
 * Unit smoke for the v1.33.19-audit fixes shipped this session.
 *
 *   P0-2  — _stripOrphanedToolResults now handles mixed-content user messages
 *           (keeps non-orphan parts, drops orphan tool_result parts, preserves order)
 *   P1-13 — LoopDetector uses stable-stringify so reshuffled-key args
 *           are recognised as the same call
 *
 * Run: node scripts/qa-app/fixes_smoke.mjs
 */
import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from "node:url";
import { dirname as _dn, resolve as _rs, join as _join } from "node:path";

const ROOT = _rs(_dn(_toPath(import.meta.url)), "..", "..", "dist");

// _stripOrphanedToolResults is internal to agent-loop.js. We exercise it via
// the documented public surface: pass a contextTransform that returns history
// shaped to look like compaction left behind a mixed-content orphan, and
// observe that runAgentLoop accepts it without 400. However, that needs a
// full mock provider — overkill for a smoke. Instead we re-export the
// helpers from the built file by reading them with `await import`.
const agentLoop = await import(_toUrl(_join(ROOT, "kernel/agent-loop.js")).href);

// The helpers are not exported. Fall back to importing the source TS via tsx
// is overkill — we instead verify the BEHAVIOUR through the compaction smoke
// which already covers the public path. Here we directly check the
// loop-detector stable-stringify fix.
const ld = await import(_toUrl(_join(ROOT, "subagents/loop-detector.js")).href);
const { LoopDetector } = ld;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? "  " + detail : ""}`);
  ok ? pass++ : fail++;
};

console.log("\n=== P1-13: stable-stringify catches reshuffled-key args ===");
{
  const d = new LoopDetector({ maxRepeatedToolCalls: 3 });
  // Same semantic call, different JSON key order each time.
  d.track({ toolCalls: [{ name: "fs_write", args: { path: "/tmp/x", content: "y" } }] });
  d.track({ toolCalls: [{ name: "fs_write", args: { content: "y", path: "/tmp/x" } }] });
  d.track({ toolCalls: [{ name: "fs_write", args: { path: "/tmp/x", content: "y" } }] });
  check("loop detected after 3 reshuffled-key calls", d.isLoopDetected() === true);
  check("reason names the offending tool",
    /fs_write/.test(d.reason() ?? ""), JSON.stringify(d.reason()));
}

console.log("\n=== P1-13: nested object key order also normalised ===");
{
  const d = new LoopDetector({ maxRepeatedToolCalls: 2 });
  d.track({ toolCalls: [{ name: "edit", args: { file: "a.ts", opts: { a: 1, b: 2 } } }] });
  d.track({ toolCalls: [{ name: "edit", args: { file: "a.ts", opts: { b: 2, a: 1 } } }] });
  check("nested reshuffle still counts as same call", d.isLoopDetected() === true);
}

console.log("\n=== P1-13: different values still count separately ===");
{
  const d = new LoopDetector({ maxRepeatedToolCalls: 3 });
  d.track({ toolCalls: [{ name: "f", args: { x: 1 } }] });
  d.track({ toolCalls: [{ name: "f", args: { x: 2 } }] });
  d.track({ toolCalls: [{ name: "f", args: { x: 3 } }] });
  check("no false-positive when values genuinely differ", d.isLoopDetected() === false);
}

console.log("\n=== LoopDetector reset() clears state ===");
{
  const d = new LoopDetector({ maxRepeatedToolCalls: 2 });
  d.track({ toolCalls: [{ name: "f", args: { x: 1 } }] });
  d.track({ toolCalls: [{ name: "f", args: { x: 1 } }] });
  check("loop detected before reset", d.isLoopDetected() === true);
  d.reset();
  check("loop NOT detected after reset", d.isLoopDetected() === false);
}

console.log("\n=== P2-1: JSON repair sentinel ===");
{
  const { repairJSON, isJsonParseFailure } = await import(
    _toUrl(_join(ROOT, "utils/json-repair.js")).href,
  );
  // Repairable input: unbalanced braces but recoverable.
  const ok1 = repairJSON('{"a":1');
  check("recoverable JSON does NOT return the sentinel",
    !isJsonParseFailure(ok1), JSON.stringify(ok1));
  // Truly unrecoverable input: contains a non-string-quoted bareword that cannot
  // be repaired by the heuristic.
  const garbage = "asdf qwer not json at all $$$";
  const failed = repairJSON(garbage);
  check("unrecoverable JSON returns the sentinel",
    isJsonParseFailure(failed), JSON.stringify(failed));
  check("sentinel.raw preserved",
    isJsonParseFailure(failed) && failed.raw === garbage);
}

console.log("\n=== P1-2: compaction emits 'compaction_failed' hook ===");
{
  const { maybeCompact } = await import(_toUrl(_join(ROOT, "context/compaction.js")).href);
  const { createHookRegistry } = await import(_toUrl(_join(ROOT, "hooks/registry.js")).href);
  const hooks = createHookRegistry();
  const seen = { failed: null };
  hooks.on("compaction_failed", (p) => { seen.failed = p; });
  // Summarizer that yields zero text — forces empty summary path.
  const emptySummarizer = {
    name: "fake",
    async *stream() { yield { type: "message_stop" }; },
  };
  const base = [
    { role: "system", content: "sys" },
    ...Array.from({ length: 8 }).flatMap((_, i) => [
      { role: "user", content: [{ type: "text", text: `q${i} ${"x".repeat(20)}` }] },
      { role: "assistant", content: [{ type: "text", text: `a${i} ${"y".repeat(20)}` }] },
    ]),
  ];
  const res = await maybeCompact(base, {
    triggerTokens: 50,
    preserveLastTurns: 2,
    summarizer: emptySummarizer,
    summaryModel: "fake",
    hooks,
  });
  check("compaction NOT successful (no summary)", res.compacted === false);
  check("compaction_failed hook fired", seen.failed !== null);
  check("hook payload has reason=summarizer_empty",
    seen.failed?.reason === "summarizer_empty");
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
