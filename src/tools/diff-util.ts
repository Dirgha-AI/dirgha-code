/** tools/diff-util.ts — SEARCH/REPLACE block diff engine */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolResult } from '../types.js';
import { invalidateFileCache, recordWrite } from '../utils/session-cache.js';
import { isReadOnlyPath } from '../permission/judge.js';

interface DiffBlock {
  search: string;
  replace: string;
}

export function parseDiffBlocks(diff: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = diff.split('\n');
  
  let currentSearch: string[] = [];
  let currentReplace: string[] = [];
  let mode: 'idle' | 'search' | 'replace' = 'idle';

  for (const line of lines) {
    if (line.startsWith('<<<<<<< SEARCH')) {
      mode = 'search';
      currentSearch = [];
    } else if (line.startsWith('=======')) {
      mode = 'replace';
      currentReplace = [];
    } else if (line.startsWith('>>>>>>> REPLACE')) {
      if (mode === 'replace') {
        blocks.push({
          search: currentSearch.join('\n'),
          replace: currentReplace.join('\n'),
        });
      }
      mode = 'idle';
    } else if (mode === 'search') {
      currentSearch.push(line);
    } else if (mode === 'replace') {
      currentReplace.push(line);
    }
  }

  return blocks;
}

/**
 * Normalizes whitespace and indentation for comparison.
 */
function normalize(s: string): string {
  return s.split('\n').map(l => l.trimEnd()).join('\n').trim();
}

export function diffEditFileTool(input: Record<string, any>): ToolResult {
  try {
    const abs = resolve(input['path'] as string);
    const readOnlyMatch = isReadOnlyPath(abs);
    if (readOnlyMatch) return { tool: 'diff_edit_file', result: '', error: `Path is read-only: ${readOnlyMatch}` };

    let content = readFileSync(abs, 'utf8');
    const blocks = parseDiffBlocks(input['diff'] as string);

    if (blocks.length === 0) {
      return { tool: 'diff_edit_file', result: '', error: 'No valid SEARCH/REPLACE blocks found in diff. Use markers: <<<<<<< SEARCH, =======, >>>>>>> REPLACE' };
    }

    let appliedCount = 0;
    for (const block of blocks) {
      // 1. Exact match
      if (content.includes(block.search)) {
        content = content.replace(block.search, block.replace);
        appliedCount++;
        continue;
      }

      // 2. Trimmed match (handle trailing whitespace differences)
      const normSearch = normalize(block.search);
      if (!normSearch) {
          // Empty search block could be dangerous, only allow if exact
          continue;
      }

      // Very simple line-based search for normalized content
      const lines = content.split('\n');
      const searchLines = block.search.split('\n');
      let found = false;

      for (let i = 0; i <= lines.length - searchLines.length; i++) {
        const chunk = lines.slice(i, i + searchLines.length).join('\n');
        if (normalize(chunk) === normSearch) {
          content = lines.slice(0, i).join('\n') + 
                    (i > 0 ? '\n' : '') + 
                    block.replace + 
                    (i + searchLines.length < lines.length ? '\n' : '') + 
                    lines.slice(i + searchLines.length).join('\n');
          appliedCount++;
          found = true;
          break;
        }
      }

      if (!found) {
        return { tool: 'diff_edit_file', result: '', error: `Failed to find SEARCH block in ${abs}:\n${block.search}` };
      }
    }

    writeFileSync(abs, content, 'utf8');
    invalidateFileCache(abs);
    recordWrite(abs);

    return { tool: 'diff_edit_file', result: `Applied ${appliedCount} SEARCH/REPLACE block(s) to ${abs}` };
  } catch (e) {
    return { tool: 'diff_edit_file', result: '', error: (e as Error).message };
  }
}
