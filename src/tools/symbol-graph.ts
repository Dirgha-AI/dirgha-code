/**
 * tools/symbol-graph.ts — cross-file symbol graph.
 *
 * `repo_map` gives file-local symbol lists. `symbol_graph` gives the
 * cross-file picture you need to do a safe rename or understand blast
 * radius: where a symbol is defined, where it's imported, where it's
 * called. Pure ripgrep under the hood — no LSP, no language server
 * required, no bundle bloat.
 *
 * It's not a replacement for tsserver / rust-analyzer — it can't resolve
 * aliasing (re-exports, namespace imports) or disambiguate method calls
 * on different types. But for the common case of "I'm about to rename
 * `foo` — what else touches it?", it's fast and language-agnostic.
 */
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ToolResult } from '../types.js';

interface SymbolHit {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface SymbolGraph {
  symbol: string;
  root: string;
  definitions: SymbolHit[];
  usages: SymbolHit[];
}

const CODE_GLOBS = [
  '*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs',
  '*.py', '*.rs', '*.go', '*.rb', '*.java', '*.kt', '*.scala',
  '*.c', '*.cc', '*.cpp', '*.h', '*.hpp', '*.cs',
  '*.swift', '*.php', '*.ex', '*.exs',
];

// Regexes that a defining line usually matches — language-agnostic but
// conservative. Anything that doesn't match here is classified as a
// usage. The point is to split definitions from usages fast, not to
// guarantee zero false-positives — the output shows the raw lines so a
// human (or the LLM) can sanity-check.
const DEFINITION_PATTERNS: RegExp[] = [
  /\bfunction\s+SYMBOL\s*\(/,                // JS/TS function
  /\bclass\s+SYMBOL\b/,                      // JS/TS/Py/Java/Kt/C# class
  /\binterface\s+SYMBOL\b/,                  // TS/Java/C# interface
  /\btype\s+SYMBOL\s*=/,                     // TS type alias
  /\bconst\s+SYMBOL\s*[:=]/,                 // JS/TS const
  /\blet\s+SYMBOL\s*[:=]/,                   // JS/TS let
  /\bvar\s+SYMBOL\s*[:=]/,                   // JS var
  /\bdef\s+SYMBOL\s*\(/,                     // Python def
  /\bfn\s+SYMBOL\s*[<(]/,                    // Rust fn
  /\bpub\s+fn\s+SYMBOL\b/,                   // Rust public fn
  /\bstruct\s+SYMBOL\b/,                     // Rust/C/Go struct
  /\bfunc\s+SYMBOL\s*\(/,                    // Go func
  /\b(public|private|protected)\s+.*\s+SYMBOL\s*\(/, // Java/C# method
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeForRipgrep(symbol: string): boolean {
  // Only accept identifiers. The user (or an LLM) passing something like
  // `foo|bar` or `;rm` into ripgrep -e would otherwise end up with a
  // regex injection.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol);
}

function runRipgrep(symbol: string, root: string): SymbolHit[] {
  const escaped = escapeRegex(symbol);
  const args = [
    'rg',
    '--no-heading',
    '--line-number',
    '--column',
    '--max-count', '20',
    '--max-filesize', '500K',
    ...CODE_GLOBS.flatMap(g => ['-g', g]),
    '--word-regexp',
    '-e', escaped,
    root,
  ];
  let stdout = '';
  try {
    stdout = execSync(args.map(a => JSON.stringify(a)).join(' '), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
  } catch (e: any) {
    // rg exits non-zero when there are no matches; treat as empty set.
    if (e?.status === 1) return [];
    // Any other error (missing rg binary etc.) → fall through to empty
    // and let the caller report "rg not installed".
    stdout = e?.stdout ? String(e.stdout) : '';
  }

  const hits: SymbolHit[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const m = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, lineNo, col, text] = m;
    hits.push({
      file: relative(root, file!) || file!,
      line: parseInt(lineNo!, 10),
      col: parseInt(col!, 10),
      text: (text ?? '').slice(0, 200),
    });
  }
  return hits;
}

function isDefinitionLine(symbol: string, text: string): boolean {
  for (const pattern of DEFINITION_PATTERNS) {
    const re = new RegExp(pattern.source.replace(/SYMBOL/g, escapeRegex(symbol)), pattern.flags);
    if (re.test(text)) return true;
  }
  return false;
}

export function symbolGraphTool(input: Record<string, any>): ToolResult {
  const symbol = String(input['symbol'] ?? '').trim();
  const root = resolve(String(input['path'] ?? '.'));

  if (!symbol) return { tool: 'symbol_graph', result: '', error: 'symbol required' };
  if (!safeForRipgrep(symbol)) {
    return { tool: 'symbol_graph', result: '', error: 'symbol must be a plain identifier (letters, digits, underscore)' };
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { tool: 'symbol_graph', result: '', error: `path not a directory: ${root}` };
  }

  const hits = runRipgrep(symbol, root);
  if (hits.length === 0) {
    return { tool: 'symbol_graph', result: `No matches for \`${symbol}\` in ${root}` };
  }

  const definitions: SymbolHit[] = [];
  const usages: SymbolHit[] = [];
  for (const hit of hits) {
    (isDefinitionLine(symbol, hit.text) ? definitions : usages).push(hit);
  }

  const graph: SymbolGraph = { symbol, root, definitions, usages };

  // Render a human-readable graph. Agents also get JSON via `input.json`.
  if (input['json']) {
    return { tool: 'symbol_graph', result: JSON.stringify(graph, null, 2) };
  }

  const lines: string[] = [];
  lines.push(`Symbol: \`${symbol}\``);
  lines.push(`Root:   ${root}`);
  lines.push(`Definitions: ${definitions.length}`);
  for (const d of definitions.slice(0, 20)) {
    lines.push(`  ${d.file}:${d.line}:${d.col}  ${d.text.trim()}`);
  }
  if (definitions.length > 20) lines.push(`  … and ${definitions.length - 20} more definitions`);

  // Group usages by file so the output is scannable.
  const byFile = new Map<string, SymbolHit[]>();
  for (const u of usages) {
    const list = byFile.get(u.file) ?? [];
    list.push(u);
    byFile.set(u.file, list);
  }
  lines.push(`Usages: ${usages.length} (across ${byFile.size} files)`);
  const sortedFiles = [...byFile.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 30);
  for (const [file, fileHits] of sortedFiles) {
    lines.push(`  ${file} (${fileHits.length})`);
    for (const hit of fileHits.slice(0, 5)) {
      lines.push(`    L${hit.line}  ${hit.text.trim().slice(0, 120)}`);
    }
    if (fileHits.length > 5) lines.push(`    … and ${fileHits.length - 5} more in this file`);
  }
  if (byFile.size > 30) lines.push(`  … and ${byFile.size - 30} more files`);

  return { tool: 'symbol_graph', result: lines.join('\n') };
}
