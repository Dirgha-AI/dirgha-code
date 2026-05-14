#!/usr/bin/env node
/**
 * Dispatch a surgical fix via DeepSeek v4-flash.
 *
 * The model is given:
 *   - The current contents of one or more source files (full files).
 *   - A finding ID, a clear instruction, and constraints.
 *
 * The model is REQUIRED to respond with a strict JSON object of the form
 * {
 *   "edits": [
 *     { "file": "src/x.ts", "old": "...exact substring...", "new": "...replacement..." }
 *   ]
 * }
 *
 * `old` must match EXACTLY ONCE in the file. We apply each edit with a
 * simple .split/.join and refuse if `old` does not appear exactly once.
 * No partial-context heuristics; no fuzzy matching. Either it lands cleanly
 * or we abort and surface the failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY = "sk-9cbb31b936224af6a8d99f3c7d470cda";
const MODEL = process.env.DS_MODEL ?? "deepseek-v4-flash";
const URL = "https://api.deepseek.com/chat/completions";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: ds-fix.mjs <spec.json>"); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const fileBlocks = spec.files.map((f) => {
  const text = readFileSync(resolve(f), "utf8");
  return `### FILE: ${f}\n\`\`\`ts\n${text}\n\`\`\``;
}).join("\n\n");

const system = [
  "You are a precise code-edit assistant for TypeScript projects.",
  "You will be given the full current contents of one or more files.",
  "Output STRICT JSON only. No prose, no markdown fences, no comments.",
  "Schema: { \"edits\": [ { \"file\": \"<path>\", \"old\": \"<exact substring>\", \"new\": \"<replacement>\" } ] }",
  "Rules for each edit:",
  "  - `old` MUST appear EXACTLY ONCE in the named file. Include enough surrounding context to make it unique.",
  "  - `old` and `new` are full multi-line strings with original indentation preserved (tabs vs spaces matters).",
  "  - Do not change unrelated lines. Do not reformat. Do not add imports unless required.",
  "  - If multiple unrelated changes are needed in one file, emit multiple edits.",
  "  - Order edits so each `old` is still findable after previous edits land.",
  "  - If the change is impossible, return { \"edits\": [] } — never invent code.",
].join("\n");

const user = [
  `# Fix: ${spec.id}`,
  ``,
  `## Instruction`,
  spec.instruction,
  ``,
  `## Constraints`,
  spec.constraints ?? "(none)",
  ``,
  `## Source files`,
  fileBlocks,
  ``,
  `Respond with the JSON object only.`,
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
const reasoning = json.choices?.[0]?.message?.reasoning_content ?? "";
const finish = json.choices?.[0]?.finish_reason;

let parsed;
try { parsed = JSON.parse(content); }
catch (e) {
  // Fall back: extract first {...} block in case the model wrapped it.
  const m = content.match(/\{[\s\S]*\}/);
  if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  if (!parsed) {
    console.error(`[${spec.id}] non-JSON reply (finish=${finish}, dt=${dt}ms)`);
    console.error("CONTENT:", content.slice(0, 600));
    if (reasoning) console.error("REASONING:", reasoning.slice(0, 400));
    process.exit(4);
  }
}
const edits = Array.isArray(parsed?.edits) ? parsed.edits : [];
if (!edits.length) {
  console.error(`[${spec.id}] model returned zero edits. reasoning=${reasoning.slice(0,200)}`);
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
