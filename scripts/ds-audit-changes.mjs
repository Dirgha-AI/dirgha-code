#!/usr/bin/env node
/**
 * DeepSeek-v4-flash reviewer for the full session diff.
 *
 *   - Reads /tmp/all-changes.diff
 *   - Reads docs/cli/agent/v1.33.19-audit.md so DeepSeek knows the intent
 *   - Asks DeepSeek to produce a per-change verdict in JSON:
 *       { changes: [ { hunk: string, audit_finding_id?: string,
 *                      verdict: "correct"|"risky"|"wrong",
 *                      notes: string,
 *                      regression_risk: "low"|"medium"|"high",
 *                      suggested_followup?: string } ],
 *         overall: { ship: boolean, summary: string } }
 *   - Prints the verdict and writes to /tmp/deepseek-change-audit.json.
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY = "sk-9cbb31b936224af6a8d99f3c7d470cda";
const MODEL = "deepseek-v4-flash";
const URL = "https://api.deepseek.com/chat/completions";

const diff = readFileSync("/tmp/all-changes.diff", "utf8");
const auditDoc = readFileSync(
  "/root/dirgha-code-release/docs/cli/agent/v1.33.19-audit.md", "utf8",
);

const system = [
  "You are a senior TypeScript reviewer.",
  "You are given (a) a unified diff of all source changes made this session and (b) the audit document those changes were meant to address.",
  "Step through the diff hunk-by-hunk and judge each one against the audit doc.",
  "Output STRICT JSON only — no commentary outside the JSON.",
  "Schema:",
  "  { \"changes\": [ {",
  "      \"file\": \"<path>\",",
  "      \"hunk_summary\": \"<2-line description of the change>\",",
  "      \"audit_finding_id\": \"<P0-1, P1-2, etc., or null>\",",
  "      \"verdict\": \"correct\" | \"risky\" | \"wrong\",",
  "      \"notes\": \"<one paragraph reasoning>\",",
  "      \"regression_risk\": \"low\" | \"medium\" | \"high\",",
  "      \"suggested_followup\": \"<one-line follow-up or null>\"",
  "    }, ... ],",
  "    \"overall\": { \"ship\": <bool>, \"summary\": \"<2-3 sentences>\" } }",
  "Be honest. If a change introduces a bug, mark `verdict: \"wrong\"` and explain what would break.",
  "If a change is reasonable but could regress something subtle, mark `verdict: \"risky\"`.",
  "If the change cleanly matches the audit and has no side effects, mark `verdict: \"correct\"`.",
  "`ship: false` if ANY change is `verdict: \"wrong\"` OR more than two are `risky`.",
].join("\n");

const user = [
  "# Audit document",
  auditDoc,
  "",
  "# Full session diff",
  "```diff",
  diff,
  "```",
  "",
  "Produce the JSON verdict now.",
].join("\n");

const body = {
  model: MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  temperature: 0.1,
  max_tokens: 16000,
  stream: false,
  response_format: { type: "json_object" },
};

const t0 = Date.now();
const r = await fetch(URL, {
  method: "POST",
  headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!r.ok) {
  console.error("DeepSeek HTTP", r.status, await r.text().catch(()=> ""));
  process.exit(3);
}
const json = await r.json();
const dt = Date.now() - t0;
const content = json.choices?.[0]?.message?.content ?? "";

let parsed;
try { parsed = JSON.parse(content); }
catch {
  const m = content.match(/\{[\s\S]*\}/);
  if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
}
if (!parsed) {
  console.error("non-JSON reply:", content.slice(0,600));
  process.exit(4);
}

writeFileSync("/tmp/deepseek-change-audit.json", JSON.stringify(parsed, null, 2));

console.log(`\n[deepseek-change-audit] dt=${dt}ms  model=${MODEL}`);
console.log(`\noverall.ship = ${parsed.overall?.ship}`);
console.log(`overall.summary: ${parsed.overall?.summary}\n`);

const changes = parsed.changes ?? [];
let correct = 0, risky = 0, wrong = 0;
for (const c of changes) {
  const tag = c.verdict === "wrong" ? "✗ WRONG  " : c.verdict === "risky" ? "▲ RISKY  " : "✓ correct";
  console.log(`${tag}  ${c.file}  (${c.audit_finding_id ?? "?"})`);
  console.log(`  ${c.hunk_summary}`);
  if (c.verdict !== "correct") {
    console.log(`  notes: ${c.notes}`);
    if (c.suggested_followup) console.log(`  follow-up: ${c.suggested_followup}`);
  }
  if (c.verdict === "wrong") wrong += 1;
  else if (c.verdict === "risky") risky += 1;
  else correct += 1;
}
console.log(`\nsummary: ${correct} correct, ${risky} risky, ${wrong} wrong`);
console.log(`full JSON: /tmp/deepseek-change-audit.json`);
process.exit(wrong > 0 ? 1 : 0);
