#!/usr/bin/env node
/**
 * Full-file rewrite dispatch via DeepSeek-v4-flash.
 *
 * For architectural refactors where surgical-unique-substring edits are too
 * granular. Each spec entry produces ONE complete file (overwrite or create).
 *
 * Spec JSON shape:
 *   {
 *     "id":      "IMPL-01-A-HEALTH-MONITOR",
 *     "context": [ "path1", "path2", ... ],   // read-only inputs (spec doc, source for reference)
 *     "external":[ "/abs/path1", ... ],       // optional, read-only inputs from outside cwd
 *     "targets": [
 *       {
 *         "file":         "src/intelligence/health-monitor.ts",
 *         "instruction":  "Long prose describing what this file must be.",
 *         "create_only":  false               // if true, refuse if file already exists
 *       },
 *       ...
 *     ]
 *   }
 *
 * Each target is its own DeepSeek call. DeepSeek must return the COMPLETE new
 * file contents inside one ```ts (or ```tsx / ```js) fenced block. No prose,
 * no partial diffs, no `// ... existing code` ellipses. We extract the block
 * and write the file. The caller is responsible for typecheck + tests.
 *
 * Reads DEEPSEEK_API_KEY from env. Never from a hardcoded literal.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error("DEEPSEEK_API_KEY env var is required."); process.exit(2); }
const MODEL = process.env.DS_MODEL ?? "deepseek-v4-flash";
const URL = "https://api.deepseek.com/chat/completions";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: ds-rewrite.mjs <spec.json>"); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));

function fenceLang(p) {
  const ext = extname(p).toLowerCase();
  return ({ ".ts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js",
           ".json": "json", ".md": "md", ".sh": "bash" })[ext] ?? "";
}

function readFenced(label, path) {
  try {
    const text = readFileSync(path, "utf8");
    return `### ${label}: ${path}\n\`\`\`${fenceLang(path)}\n${text}\n\`\`\``;
  } catch {
    return `### ${label}: ${path}\n(file does not exist yet)`;
  }
}

const contextBlocks = [
  ...(spec.context ?? []).map(p => readFenced("CONTEXT", resolve(p))),
  ...(spec.external ?? []).map(p => readFenced("EXTERNAL", p)),
].join("\n\n");

const system = [
  "You are a senior TypeScript engineer producing complete file rewrites for a refactor.",
  "Given (a) the design spec + supporting context, and (b) the instruction for ONE target file, you output the COMPLETE new contents of that file.",
  "Output format: ONE fenced code block in the appropriate language (e.g. ```ts ... ```).",
  "Rules:",
  "  - NO prose outside the fenced block.",
  "  - NO partial files. NO `// ... existing code`. NO ellipses.",
  "  - The output must compile under TypeScript strict mode.",
  "  - Preserve license headers, file-level comments, and import order conventions.",
  "  - If the spec requires changes that conflict with existing imports in other files, do NOT silently break them — instead, write the file as the spec requires and leave a TODO comment naming the caller-side change needed.",
  "  - If TWO interpretations of the spec are equally valid, pick the simpler one and add a one-line `// note:` comment explaining the choice.",
].join("\n");

let failed = 0;
for (const target of spec.targets) {
  const exists = existsSync(resolve(target.file));
  if (target.create_only && exists) {
    console.error(`[${spec.id}] ${target.file} already exists; create_only forbids overwrite`);
    failed += 1;
    continue;
  }

  const user = [
    `# Refactor: ${spec.id}`,
    ``,
    `## Target file`,
    target.file,
    exists ? "(this file exists; overwrite with the new contents)" : "(this file does not exist; create it)",
    ``,
    `## Instruction for this file`,
    target.instruction,
    ``,
    `## Context (design spec + reference source)`,
    contextBlocks,
    ``,
    `Produce the complete new contents of \`${target.file}\` inside ONE fenced \`\`\`${fenceLang(target.file)} block. Nothing else.`,
  ].join("\n");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 32000,
    stream: false,
  };

  console.log(`[${spec.id}] ${target.file} — dispatching...`);
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`[${spec.id}] ${target.file} HTTP ${r.status}: ${await r.text().catch(()=>"")}`);
    failed += 1;
    continue;
  }
  const json = await r.json();
  const dt = Date.now() - t0;
  const content = json.choices?.[0]?.message?.content ?? "";
  const finish = json.choices?.[0]?.finish_reason;
  const usage = json.usage ?? {};

  // Extract the first fenced block.
  const m = /```(?:ts|tsx|typescript|javascript|js|json|md|bash|sh)?\n([\s\S]*?)```/m.exec(content);
  if (!m) {
    console.error(`[${spec.id}] ${target.file} — no fenced block in reply (finish=${finish}, dt=${dt}ms)`);
    console.error("CONTENT (first 500):", content.slice(0, 500));
    failed += 1;
    continue;
  }
  const newContent = m[1];
  const outPath = resolve(target.file);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, newContent);
  console.log(`[${spec.id}] ${target.file} — wrote ${newContent.length}b (input=${usage.prompt_tokens ?? "?"}, output=${usage.completion_tokens ?? "?"}, finish=${finish}, dt=${(dt/1000).toFixed(1)}s)`);
}

if (failed > 0) {
  console.error(`[${spec.id}] FAILED on ${failed} target(s)`);
  process.exit(7);
}
console.log(`[${spec.id}] OK  ${spec.targets.length} target(s) written`);
