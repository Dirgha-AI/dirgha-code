#!/usr/bin/env node
/**
 * Review-first DeepSeek dispatch.
 *
 *   Phase 1: send DeepSeek the audit finding + the relevant file contents.
 *            Ask DeepSeek to either CONFIRM or REFUTE the finding by reading
 *            the current code. If refuted, the script aborts without writing.
 *   Phase 2: if confirmed, the same response carries an `edits` array of
 *            unique-substring replacements. We apply them, refusing fuzzy
 *            matches.
 *
 * Spec JSON shape:
 *   {
 *     "id":       "P1-2",
 *     "files":    ["src/context/compaction.ts"],     // shown to DeepSeek
 *     "finding":  "...verbatim audit finding text...",
 *     "fix":      "...one-paragraph statement of the intended change..."
 *   }
 *
 * Response JSON shape (required of DeepSeek):
 *   {
 *     "confirmed": true | false,
 *     "reasoning": "string — why confirmed/refuted",
 *     "edits":     [ { "file": "...", "old": "...", "new": "..." } ]  // only when confirmed
 *   }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY = "sk-9cbb31b936224af6a8d99f3c7d470cda";
const MODEL = process.env.DS_MODEL ?? "deepseek-v4-flash";
const URL = "https://api.deepseek.com/chat/completions";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: ds-audit-fix.mjs <spec.json>"); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const fileBlocks = spec.files.map((f) => {
  const text = readFileSync(resolve(f), "utf8");
  return `### FILE: ${f}\n\`\`\`ts\n${text}\n\`\`\``;
}).join("\n\n");

const system = [
  "You are a senior TypeScript reviewer dispatched to confirm an audit finding and propose a surgical patch.",
  "Step 1: READ the source files and decide whether the finding is real in the CURRENT code.",
  "  - If the finding is wrong (already fixed, or never accurate), respond with confirmed=false and a one-paragraph refutation. Do NOT propose edits.",
  "  - If the finding is correct, respond with confirmed=true and a unified set of substring-replacement edits.",
  "Step 2: produce STRICT JSON only — no prose outside the JSON, no markdown fences, no comments.",
  "JSON schema:",
  "  { \"confirmed\": boolean, \"reasoning\": string, \"edits\": [ { \"file\": string, \"old\": string, \"new\": string } ] }",
  "Edit rules:",
  "  - `old` MUST appear EXACTLY ONCE in the named file. Include enough surrounding context to make it unique.",
  "  - `old` and `new` are full multi-line strings with original indentation preserved (tabs vs spaces matters).",
  "  - Do not change unrelated lines. Do not reformat. Do not invent imports unless needed for the fix.",
  "  - If multiple unrelated edits are needed, emit multiple edit objects in an order such that each `old` is still findable after previous edits land.",
  "  - When refuting (confirmed=false), set edits to [].",
  "Be honest: if you do not see the bug in the code, REFUTE rather than fabricate an edit.",
].join("\n");

const user = [
  `# Audit finding: ${spec.id}`,
  ``,
  `## Claim`,
  spec.finding,
  ``,
  `## Proposed fix shape`,
  spec.fix ?? "(none — propose your own surgical fix if the finding is real)",
  ``,
  `## Source files`,
  fileBlocks,
  ``,
  `Return the JSON object only.`,
].join("\n");

const body = {
  model: MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user",   content: user },
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
if (!r.ok) { console.error("DeepSeek HTTP", r.status, await r.text().catch(()=> "")); process.exit(3); }
const json = await r.json();
const dt = Date.now() - t0;
const content = json.choices?.[0]?.message?.content ?? "";
const finish = json.choices?.[0]?.finish_reason;

let parsed;
try { parsed = JSON.parse(content); }
catch {
  const m = content.match(/\{[\s\S]*\}/);
  if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
}
if (!parsed) {
  console.error(`[${spec.id}] non-JSON reply (finish=${finish}, dt=${dt}ms)`);
  console.error("CONTENT:", content.slice(0, 800));
  process.exit(4);
}

console.log(`[${spec.id}] DeepSeek verdict: confirmed=${parsed.confirmed}, dt=${dt}ms`);
console.log(`[${spec.id}] reasoning: ${(parsed.reasoning ?? "").slice(0, 600)}`);

if (parsed.confirmed === false) {
  console.log(`[${spec.id}] REFUTED — no edits applied.`);
  process.exit(10); // distinct exit code so caller can branch
}

const edits = Array.isArray(parsed?.edits) ? parsed.edits : [];
if (!edits.length) {
  console.error(`[${spec.id}] confirmed=true but zero edits returned.`);
  process.exit(5);
}

let applied = 0;
for (const e of edits) {
  const p = resolve(e.file);
  const cur = readFileSync(p, "utf8");
  const occurrences = cur.split(e.old).length - 1;
  if (occurrences !== 1) {
    console.error(`[${spec.id}] edit not unique in ${e.file} (matches=${occurrences})`);
    console.error("  old (first 200):", JSON.stringify(e.old.slice(0,200)));
    process.exit(6);
  }
  writeFileSync(p, cur.replace(e.old, e.new));
  applied += 1;
  console.log(`[${spec.id}] applied edit to ${e.file} (old=${e.old.length}b -> new=${e.new.length}b)`);
}
console.log(`[${spec.id}] OK  ${applied} edits applied, dt=${dt}ms, model=${MODEL}`);
