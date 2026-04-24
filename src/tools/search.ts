/** tools/search.ts — Search tools: files, glob, web, QMD, FTS5 knowledge base */
import { spawnSync } from 'node:child_process';
import { readdirSync, lstatSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { glob as globFn } from 'glob';
import type { ToolResult } from '../types.js';
import { searchFiles, searchMemory, indexFile } from '../session/db.js';

// Directories never worth descending into during a file walk.
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.turbo', 'coverage', '.cache', 'out', 'target', '.venv', 'venv',
  '.bun', '.npm', '.cursor', '.vscode', '.idea', '.pnpm-store', '.yarn',
  'bun.lockb.d', '.rollup.cache', '.parcel-cache',
]);

// Directories where a brute list_files walk is almost never what the user
// wants. Typing `list_files .` from here would iterate over hundreds of
// unrelated repositories. The model must narrow down with a pattern.
const HUGE_ROOTS = new Set(['/', '/root', '/home', '/tmp', '/Users', '/var']);

export function searchFilesTool(input: Record<string, any>): ToolResult {
  try {
    const pattern = input['pattern'] as string;
    const dir = (input['path'] as string | undefined) ?? '.';
    const g = input['glob'] as string | undefined;
    const rgArgs = ['--no-heading', '-n', '--max-count', '50', pattern, dir];
    if (g) rgArgs.push('--glob', g);
    const out = spawnSync('rg', rgArgs, { encoding: 'utf8', timeout: 10000 });
    if (out.status === 0 || out.stdout) return { tool: 'search_files', result: out.stdout.trim() || 'No matches found' };
    const gout = spawnSync('grep', ['-rn', '--', pattern, dir], { encoding: 'utf8', timeout: 10000 });
    return { tool: 'search_files', result: (gout.stdout || '').trim().split('\n').slice(0, 50).join('\n') || 'No matches found' };
  } catch (e) { return { tool: 'search_files', result: '', error: (e as Error).message }; }
}

function walkDir(dir: string, results: string[], limit: number): void {
  if (results.length >= limit) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (results.length >= limit) break;
    // Skip ignored dirs and dot-prefixed entries — saves walking into
    // .git, node_modules, caches, and half a gigabyte of nothing useful.
    if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue;
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

    // Refuse brute walks of gigantic roots. Typing `list_files .` at /root
    // produces hundreds of unrelated repositories' worth of output — almost
    // never what the user wants. Force the model to use a concrete subpath
    // or a glob pattern instead.
    if (HUGE_ROOTS.has(base)) {
      return {
        tool: 'list_files',
        result: '',
        error: `Refusing to brute-walk ${base}. Supply a narrower path or use glob/search_files with a targeted pattern.`,
      };
    }

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

/** Resolve QMD binary: PATH → npm global → DIRGHA_QMD_PATH env override */
function resolveQMD(): string | null {
  // Explicit override (useful for custom installs)
  if (process.env['DIRGHA_QMD_PATH']) return process.env['DIRGHA_QMD_PATH'];
  // Check PATH
  const which = spawnSync('which', ['qmd'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  // npm global root
  const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (npmRoot.status === 0) {
    const candidate = join(npmRoot.stdout.trim(), '@tobilu', 'qmd', 'qmd');
    if (existsSync(candidate)) return candidate;
  }
  return null;
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
    const qmd = resolveQMD();
    if (!qmd) return { tool: 'qmd_search', result: '', error: 'QMD not found. Install with: npm i -g @tobilu/qmd' };
    const out = spawnSync(qmd, ['query', input['query'] as string, '--limit', String((input['limit'] as number) ?? 5)], {
      encoding: 'utf8', timeout: 15000,
    });
    if (out.status !== 0) return { tool: 'qmd_search', result: '', error: out.stderr || 'qmd failed' };
    return { tool: 'qmd_search', result: out.stdout.trim().slice(0, 8000) };
  } catch (e) { return { tool: 'qmd_search', result: '', error: (e as Error).message }; }
}
