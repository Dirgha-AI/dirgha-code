#!/usr/bin/env node
/**
 * Long-form architecture-audit dispatch via DeepSeek-v4-flash (1 M context).
 *
 * Reads a spec JSON of the form
 *   {
 *     "id":         "DEEP-AUDIT-...",
 *     "files":      [ "path/relative/to/repo", ... ],   // sent verbatim
 *     "external":   [ "/abs/path/to/external/file", ...], // optional, sent verbatim
 *     "instruction": "<long prose: goals, output shape, hard rules>",
 *     "outputFile": "docs/.../audit.md"                // where the markdown lands
 *   }
 *
 * Sends every file as a fenced block tagged with its language. Asks DeepSeek
 * for ONE markdown document, written to `outputFile`. No JSON wrapper, no
 * edits — just a long-form report. This is the right shape for compare /
 * architecture / migration-plan deliverables.
 *
 * Reads DEEPSEEK_API_KEY from env. NEVER from a hardcoded literal.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) {
  console.error("DEEPSEEK_API_KEY env var is required.");
  process.exit(2);
}
const MODEL = process.env.DS_MODEL ?? "deepseek-v4-flash";
const URL = "https://api.deepseek.com/chat/completions";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: ds-deep-audit.mjs <spec.json>"); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));

function fenceLang(p) {
  const ext = extname(p).toLowerCase();
  return ({ ".ts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js",
           ".json": "json", ".md": "md", ".sh": "bash", ".py": "py" })[ext] ?? "";
}
function block(label, path) {
  const text = readFileSync(path, "utf8");
  return `### ${label}\n\`\`\`${fenceLang(path)}\n${text}\n\`\`\``;
}

const fileBlocks = (spec.files ?? []).map(f => block(`FILE: ${f}`, resolve(f)));
const extBlocks  = (spec.external ?? []).map(f => block(`EXTERNAL: ${f}`, f));
const allBlocks = [...fileBlocks, ...extBlocks].join("\n\n");

const system = [
  "You are a senior systems architect dispatched to produce a long-form audit.",
  "You will be given (a) one or more source files from the repo under review, and (b) reference source from another project to compare against.",
  "Produce ONE complete markdown document. No JSON wrapper. No code fences around the whole thing.",
  "Voice: direct, technical, builder-to-builder. Cite file:line for every claim. No marketing language. No 'crucial', 'comprehensive', 'robust'. No em dashes.",
  "If the audit needs sections you weren't asked for, add them. If a section in the prompt doesn't apply, omit it and say why.",
  "Length: as long as needed for accuracy. Brevity is not a goal; clarity is.",
].join("\n");

const user = [
  `# Audit: ${spec.id}`,
  ``,
  `## Goal + output shape`,
  spec.instruction,
  ``,
  `## Source files`,
  allBlocks,
  ``,
  `Produce the markdown document now. Output ONLY the markdown — no preamble, no postamble, no JSON.`,
].join("\n");

const tokenEstimate = Math.ceil((user.length + system.length) / 4);
console.log(`[${spec.id}] dispatching ${tokenEstimate}k tokens of input to ${MODEL}...`);

const body = {
  model: MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user",   content: user },
  ],
  temperature: 0.1,
  max_tokens: 32000,
  stream: false,
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
const usage = json.usage ?? {};

if (!content || content.length < 200) {
  console.error(`[${spec.id}] empty / tiny response (finish=${finish}, dt=${dt}ms)`);
  console.error("CONTENT:", content);
  process.exit(4);
}

const outPath = resolve(spec.outputFile);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, content);

console.log(`[${spec.id}] wrote ${spec.outputFile} (${content.length} bytes)`);
console.log(`[${spec.id}] tokens: input=${usage.prompt_tokens ?? '?'}, output=${usage.completion_tokens ?? '?'}, finish=${finish}, dt=${(dt/1000).toFixed(1)}s, model=${MODEL}`);
