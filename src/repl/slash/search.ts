
/**
 * repl/slash/search.ts — Semantic code search commands
 * /what — Search codebase for symbols, patterns, or concepts
 */
import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { SlashCommand, ReplContext } from './types.js';

interface SearchResult {
  file: string;
  line: number;
  content: string;
  context: string;
  score: number;
}

function searchFiles(cwd: string, query: string, extensions: string[] = ['.ts', '.js', '.tsx', '.jsx', '.json', '.md']): SearchResult[] {
  const results: SearchResult[] = [];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.dirgha', 'coverage'];
  
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const relPath = relative(cwd, fullPath);
      
      if (ignoreDirs.some(d => relPath.includes(d))) continue;
      
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          
          // Search patterns
          const queryLower = query.toLowerCase();
          const patterns = [
            queryLower,
            queryLower.replace(/\s+/g, ''),
            queryLower.replace(/[-_]/g, ''),
            queryLower.replace(/\s+/g, '_'),
            queryLower.replace(/\s+/g, '-'),
            ...queryLower.split(/\s+/)
          ];
          
          lines.forEach((line, idx) => {
            const lineLower = line.toLowerCase();
            let score = 0;
            
            // Exact match
            if (lineLower.includes(queryLower)) {
              score += 10;
            }
            
            // CamelCase match
            if (patterns.some(p => lineLower.includes(p))) {
              score += 5;
            }
            
            // Symbol patterns
            if (line.match(new RegExp(`(function|class|const|let|var|interface|type|export|import).*${query.replace(/\s+/g, '\\w*')}`, 'i'))) {
              score += 8;
            }
            
            if (score > 0) {
              // Get context (2 lines before/after)
              const contextStart = Math.max(0, idx - 2);
              const contextEnd = Math.min(lines.length, idx + 3);
              const context = lines.slice(contextStart, contextEnd).join('\n');
              
              results.push({
                file: relPath,
                line: idx + 1,
                content: line.trim(),
                context,
                score
              });
            }
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }
  
  try {
    walk(cwd);
  } catch {
    // Directory might not exist
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

async function searchGrep(cwd: string, query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  const run = (cmd: string, args: string[]) => new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const { spawn } = require('node:child_process');
    const proc = spawn(cmd, args, { cwd });
    let stdout = '';
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.on("close", (code: number | null) => { resolve({ stdout, status: code }); });
  });

  // Try ripgrep first
  let rgResult = await run('rg', [
    '-n', '-C', '2',
    '--type', 'ts', '--type', 'js', '--type', 'tsx', '--type', 'jsx',
    '--type', 'json', '--type', 'md',
    '-i', query
  ]);
  
  // Fallback to grep
  if (rgResult.status !== 0) {
    rgResult = await run('grep', [
      '-rn', '-C', '2',
      '--include=*.ts', '--include=*.js',
      '--include=*.tsx', '--include=*.jsx',
      '--include=*.json', '--include=*.md',
      '-i', query, '.'
    ]);
  }
  
  if (rgResult.stdout) {
    const lines = rgResult.stdout.split('\n');
    let currentFile = '';
    let currentLine = 0;
    let contextLines: string[] = [];
    
    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (match) {
        if (currentFile && contextLines.length > 0) {
          results.push({
            file: currentFile,
            line: currentLine,
            content: contextLines[contextLines.length >> 1] || '',
            context: contextLines.join('\n'),
            score: 5
          });
        }
        currentFile = match[1];
        currentLine = parseInt(match[2], 10);
        contextLines = [match[3]];
      } else if (line.startsWith('-') || line.startsWith('+')) {
        contextLines.push(line.slice(2));
      }
    }
  }
  
  return results;
}

const whatCommand: SlashCommand = {
  name: '/what',
  description: 'Semantic code search — find symbols, patterns, concepts',
  execute: async (args: string, ctx: ReplContext) => {
    const query = args.trim();
    
    if (!query) {
      ctx.print(`${chalk.yellow('Usage:')} /what <search-query>`);
      ctx.print(`  /what auth           — Find auth-related code`);
      ctx.print(`  /what UserService    — Find UserService class/function`);
      ctx.print(`  /what /api/users     — Find API endpoint`);
      ctx.print(`  /what export.*config — Regex pattern search`);
      return { type: 'success', result: { message: 'Usage shown' } };
    }

    const cwd = ctx.cwd || process.cwd();
    ctx.print(`${chalk.dim('Searching for:')} ${chalk.cyan(query)}\n`);
    
    const startTime = Date.now();
    
    // Try grep-based search first (faster for large repos)
    let results = await searchGrep(cwd, query);
    
    // Fallback to manual walk if grep fails
    if (results.length === 0) {
      results = searchFiles(cwd, query);
    }
    
    const duration = Date.now() - startTime;
    
    if (results.length === 0) {
      ctx.print(`${chalk.yellow('No results found')}`);
      ctx.print(`${chalk.dim('Try:')}`);
      ctx.print(`  • Broaden your search terms`);
      ctx.print(`  • Check file extensions: /what ${query} --ext ts,js`);
      ctx.print(`  • Use /find for exact file names`);
      return { type: 'success', result: { results: 0, duration } };
    }

    // Group by file
    const byFile = new Map<string, SearchResult[]>();
    for (const r of results) {
      if (!byFile.has(r.file)) {
        byFile.set(r.file, []);
      }
      byFile.get(r.file)!.push(r);
    }

    ctx.print(`${chalk.green('✓')} Found ${chalk.cyan(results.length)} match(es) in ${chalk.cyan(byFile.size)} file(s) ${chalk.dim(`(${duration}ms)`)}\n`);

    let shown = 0;
    const maxResults = 15;
    
    for (const [file, matches] of byFile) {
      if (shown >= maxResults) break;
      
      ctx.print(`${chalk.cyan(file)}`);
      
      for (const match of matches.slice(0, 3)) {
        if (shown >= maxResults) break;
        
        const lineStr = match.line.toString().padStart(4, ' ');
        const highlighted = highlightMatch(match.content, query);
        ctx.print(`  ${chalk.dim(lineStr)} │ ${highlighted}`);
        shown++;
      }
      
      if (matches.length > 3) {
        ctx.print(`  ${chalk.dim(`... and ${matches.length - 3} more`)}`);
      }
      
      ctx.print('');
    }

    if (results.length > maxResults) {
      ctx.print(`${chalk.dim(`Showing ${maxResults} of ${results.length} results. Use --all to see all.`)}`);
    }

    return { type: 'success', result: { 
      results: results.length, 
      files: byFile.size,
      duration,
      topFile: results[0]?.file
    } };
  }
};

function highlightMatch(line: string, query: string): string {
  const queryLower = query.toLowerCase();
  const lineLower = line.toLowerCase();
  const idx = lineLower.indexOf(queryLower);
  
  if (idx === -1) return chalk.dim(line);
  
  const before = line.slice(0, idx);
  const match = line.slice(idx, idx + query.length);
  const after = line.slice(idx + query.length);
  
  return chalk.dim(before) + chalk.yellow(match) + chalk.dim(after);
}

export const searchCommands: SlashCommand[] = [
  whatCommand
];
