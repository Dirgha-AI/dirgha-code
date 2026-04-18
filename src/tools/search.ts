/** tools/search.ts — Search tools: files, glob, web, QMD, FTS5 knowledge base */
import { spawn } from 'node:child_process';
import { readdirSync, lstatSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { glob as globFn } from 'glob';
import type { ToolResult } from '../types.js';
import { searchFiles, searchMemory, indexFile } from '../session/db.js';

export async function searchFilesTool(input: Record<string, any>): Promise<ToolResult> {
  const pattern = input['pattern'] as string;
  const dir = (input['path'] as string | undefined) ?? '.';
  const g = input['glob'] as string | undefined;

  const run = (cmd: string, args: string[]) => new Promise<{ out: string; code: number | null }>((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    const timer = setTimeout(() => { proc.kill(); resolve({ out, code: null }); }, 10000);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ out, code }); });
  });

  try {
    const rgArgs = ['--no-heading', '-n', '--max-count', '50', pattern, dir];
    if (g) rgArgs.push('--glob', g);
    const rg = await run('rg', rgArgs);
    if (rg.code === 0 || rg.out) return { tool: 'search_files', result: rg.out.trim() || 'No matches found' };

    const grep = await run('grep', ['-rn', '--', pattern, dir]);
    return { tool: 'search_files', result: grep.out.trim().split('\n').slice(0, 50).join('\n') || 'No matches found' };
  } catch (e) { return { tool: 'search_files', result: '', error: (e as Error).message }; }
}

function walkDir(dir: string, results: string[], limit: number): void {
  if (results.length >= limit) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (results.length >= limit) break;
    const full = join(dir, entry);
    try {
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      st.isDirectory() ? walkDir(full, results, limit) : results.push(full);
    } catch { /* skip */ }
  }
}

export function listFilesTool(input: Record<string, any>): ToolResult {
  try {
    const pattern = input['pattern'] as string;
    const base = resolve(pattern.includes('*') ? pattern.split('*')[0]!.replace(/\/$/, '') || '.' : pattern);
    const cwd = process.cwd();
    const cwdSep = cwd.endsWith(sep) ? cwd : cwd + sep;
    if (base !== cwd && !base.startsWith(cwdSep)) return { tool: 'list_files', result: '', error: 'Path outside cwd' };
    const results: string[] = [];
    walkDir(base, results, 100);
    return { tool: 'list_files', result: results.join('\n') || 'No files found' };
  } catch (e) { return { tool: 'list_files', result: '', error: (e as Error).message }; }
}

export function globTool(input: Record<string, any>): ToolResult {
  try {
    const pattern = input['pattern'] as string;
    if (pattern.startsWith('/') || pattern.startsWith('..')) return { tool: 'glob', result: '', error: 'Path outside cwd' };
    const matches = globFn.sync(pattern, { cwd: process.cwd(), nodir: false });
    return { tool: 'glob', result: matches.slice(0, 200).join('\n') || 'No matches' };
  } catch (e) { return { tool: 'glob', result: '', error: (e as Error).message }; }
}

export async function webFetchTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    const url = input['url'] as string;
    if (!/^https?:\/\//i.test(url)) return { tool: 'web_fetch', result: '', error: 'Only http/https URLs supported' };
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return { tool: 'web_fetch', result: (await res.text()).slice(0, 50000) };
  } catch (e) { return { tool: 'web_fetch', result: '', error: (e as Error).message }; }
}

export async function webSearchTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    const query = encodeURIComponent(input['query'] as string);
    const maxResults = (input['max_results'] as number) ?? 5;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}&kl=us-en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DirghaBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const re = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && results.length < maxResults) {
      results.push({ url: m[1]!, title: m[2]!.trim(), snippet: m[3]!.trim() });
    }
    if (!results.length) return { tool: 'web_search', result: `No results for: ${decodeURIComponent(query)}` };
    return { tool: 'web_search', result: results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join('\n\n') };
  } catch (e) { return { tool: 'web_search', result: '', error: (e as Error).message }; }
}

/** Resolve QMD binary: PATH → npm global → DIRGHA_QMD_PATH env override.
 *  Memoized so the spawn cost is paid once per process lifetime. */
let qmdCache: string | null | undefined; // undefined = not resolved yet
async function resolveQMD(): Promise<string | null> {
  if (qmdCache !== undefined) return qmdCache;
  if (process.env['DIRGHA_QMD_PATH']) { qmdCache = process.env['DIRGHA_QMD_PATH']; return qmdCache; }
  try {
    const which = await runCapture('which', ['qmd']);
    if (which.code === 0 && which.stdout.trim()) { qmdCache = which.stdout.trim(); return qmdCache; }
  } catch { /* fall through */ }
  try {
    const npmRoot = await runCapture('npm', ['root', '-g']);
    if (npmRoot.code === 0) {
      const candidate = join(npmRoot.stdout.trim(), '@tobilu', 'qmd', 'qmd');
      if (existsSync(candidate)) { qmdCache = candidate; return qmdCache; }
    }
  } catch { /* fall through */ }
  qmdCache = null;
  return null;
}

function runCapture(cmd: string, args: string[], timeoutMs = 5000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    proc.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout, stderr }); });
  });
}

/** FTS5 search over indexed file content + memory (built-in, no external deps) */
export function searchKnowledgeTool(input: Record<string, any>): ToolResult {
  try {
    const query = input['query'] as string;
    const limit = (input['limit'] as number) ?? 10;
    const files = searchFiles(query, Math.ceil(limit / 2));
    const mems = searchMemory(query, Math.floor(limit / 2));
    const parts: string[] = [];
    if (files.length) {
      parts.push('## Files\n' + files.map(f => `${f.filepath}\n  ${f.snippet}`).join('\n'));
    }
    if (mems.length) {
      parts.push('## Memory\n' + mems.map(m => `[${m.key}] ${m.content}`).join('\n'));
    }
    return { tool: 'search_knowledge', result: parts.join('\n\n') || 'No results found.' };
  } catch (e) { return { tool: 'search_knowledge', result: '', error: (e as Error).message }; }
}

/** Index files in a directory into the FTS5 file_index table */
export function indexFilesTool(input: Record<string, any>): ToolResult {
  const INDEXABLE = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'md', 'json', 'toml', 'yaml', 'yml']);
  try {
    const dir = resolve((input['path'] as string | undefined) ?? '.');
    const project = process.cwd();
    const allFiles: string[] = [];
    walkDir(dir, allFiles, 500);
    let indexed = 0;
    for (const fp of allFiles) {
      try {
        const ext = fp.split('.').pop() ?? '';
        if (INDEXABLE.has(ext)) {
          const content = readFileSync(fp, 'utf8');
          indexFile(fp, content, '', project);
          indexed++;
        }
      } catch { /* skip unreadable */ }
    }
    return { tool: 'index_files', result: `Indexed ${indexed} files from ${dir}` };
  } catch (e) { return { tool: 'index_files', result: '', error: (e as Error).message }; }
}

export async function qmdSearchTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    const qmd = await resolveQMD();
    if (!qmd) return { tool: 'qmd_search', result: '', error: 'QMD not found. Install with: npm i -g @tobilu/qmd' };
    const out = await runCapture(qmd, ['query', input['query'] as string, '--limit', String((input['limit'] as number) ?? 5)], 15_000);
    if (out.code !== 0) return { tool: 'qmd_search', result: '', error: out.stderr || 'qmd failed' };
    return { tool: 'qmd_search', result: out.stdout.trim().slice(0, 8000) };
  } catch (e) { return { tool: 'qmd_search', result: '', error: (e as Error).message }; }
}
