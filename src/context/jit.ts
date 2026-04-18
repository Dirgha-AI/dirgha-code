/**
 * jit.ts — JIT context discovery (gemini pattern)
 *
 * When the agent accesses a new directory, scan up the tree for:
 * DIRGHA.md, AGENTS.md, CLAUDE.md
 *
 * Each found file is scanned for injection before loading.
 * Clean files are appended to the system prompt.
 */
import fs from 'fs';
import path from 'path';
import { scanContent } from '../agent/injector.js';

const CONTEXT_FILES = ['DIRGHA.md', 'AGENTS.md', 'CLAUDE.md'];
const MAX_CONTEXT_SIZE = 8000; // chars
const AT_REF_MAX_SIZE = 4000;  // chars per @ref expansion

export interface JitContext {
  content: string;
  sources: string[];
  blocked: string[];
}

/** Expand @path lines in a context file. No recursion into expanded content. */
export function expandAtRefs(content: string, contextFileDir: string): string {
  return content
    .split('\n')
    .map((line) => {
      const match = line.match(/^@(.+)$/);
      if (!match) return line;
      const ref = match[1].trim();
      const abs = path.resolve(contextFileDir, ref);
      try {
        if (!fs.existsSync(abs)) return line;
        const stat = fs.statSync(abs);
        if (!stat.isFile()) return line;
        const body = fs.readFileSync(abs, 'utf8');
        if (body.length > AT_REF_MAX_SIZE) return line;
        return `--- @${ref} ---\n${body}`;
      } catch {
        return line;
      }
    })
    .join('\n');
}

export function discoverContext(startDir: string = process.cwd()): JitContext {
  const sources: string[] = [];
  const blocked: string[] = [];
  let combined = '';

  let dir = path.resolve(startDir);
  const visited = new Set<string>();

  while (true) {
    if (visited.has(dir)) break;
    visited.add(dir);

    for (const filename of CONTEXT_FILES) {
      const fullPath = path.join(dir, filename);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const content = expandAtRefs(raw, dir);
        const scan = scanContent(content, fullPath);

        if (!scan.safe) {
          console.warn(`[JIT] Blocked: ${fullPath} — ${scan.reason}`);
          blocked.push(fullPath);
          continue;
        }

        if (combined.length + content.length > MAX_CONTEXT_SIZE) break;

        combined += `\n\n--- ${filename} (${dir}) ---\n${content}`;
        sources.push(fullPath);
      } catch { /* skip unreadable files */ }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return { content: combined.trim(), sources, blocked };
}

export function discoverContextSync(startDir?: string): string {
  const result = discoverContext(startDir);
  return result.content;
}

// Module-level set of dirs already checked by trackSubdirectory
const _checkedDirs = new Set<string>();

/**
 * Called after a tool execution with the file's directory.
 * Walks up from dir to root, finds any DIRGHA.md/AGENTS.md/CLAUDE.md not yet
 * loaded, reads+expands it, and returns new context to append.
 * Returns null if nothing new found.
 */
export function trackSubdirectory(dir: string): string | null {
  let current = path.resolve(dir);
  let accumulated = '';

  while (true) {
    if (!_checkedDirs.has(current)) {
      _checkedDirs.add(current);

      for (const filename of CONTEXT_FILES) {
        const fullPath = path.join(current, filename);
        try {
          if (!fs.existsSync(fullPath)) continue;
          const raw = fs.readFileSync(fullPath, 'utf8');
          const content = expandAtRefs(raw, current);
          const scan = scanContent(content, fullPath);
          if (!scan.safe) continue;
          accumulated += `\n\n--- ${filename} (${current}) ---\n${content}`;
        } catch { /* skip */ }
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return accumulated.trim() || null;
}
