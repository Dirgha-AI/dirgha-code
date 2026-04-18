/** tools/repo.ts — AST-aware repo map */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import ts from 'typescript';
import type { ToolResult } from '../types.js';

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.rs', '.go', '.java', '.kt']);

const IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.venv', 'target', '.cache', 'coverage', '.turbo', 'out',
]);

/** Extract symbols using TypeScript AST for JS/TS files */
function extractTsSymbols(content: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const symbols: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const params = node.parameters.map(p => p.name.getText(sourceFile)).join(', ');
      symbols.push(`fn ${node.name.text}(${params})`);
    } else if (ts.isClassDeclaration(node) && node.name) {
      const methods: string[] = [];
      node.members.forEach(m => {
        if (ts.isMethodDeclaration(m) && m.name) {
          methods.push(m.name.getText(sourceFile));
        }
      });
      symbols.push(`class ${node.name.text}${methods.length ? ` { ${methods.join(', ')} }` : ''}`);
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      symbols.push(`interface ${node.name.text}`);
    } else if (ts.isTypeAliasDeclaration(node) && node.name) {
      symbols.push(`type ${node.name.text}`);
    } else if (ts.isVariableDeclaration(node) && node.name && ts.isSourceFile(node.parent.parent.parent)) {
      // Only top-level exported constants
      if (ts.getCombinedModifierFlags(node as any) & ts.ModifierFlags.Export) {
        symbols.push(`const ${node.name.getText(sourceFile)}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

/** Fallback regex-based extraction for other languages */
function extractRegexSymbols(content: string, ext: string): string[] {
  const syms: string[] = [];
  const lines = content.split('\n');

  if (ext === '.py') {
    for (const line of lines) {
      // Classes
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch?.[1]) syms.push(`class ${classMatch[1]}`);
      // Functions
      const defMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
      if (defMatch?.[1]) {
        const params = defMatch[2]?.split(',').map(p => p.trim().split(':')[0]).filter(p => p !== 'self' && p !== 'cls').join(', ');
        syms.push(`fn ${defMatch[1]}(${params || ''})`);
      }
      if (syms.length >= 20) break;
    }
  } else if (ext === '.rs') {
    for (const line of lines) {
      // Functions
      const fnMatch = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/);
      if (fnMatch?.[1]) syms.push(`fn ${fnMatch[1]}(...)`);
      // Structs/Enums/Traits
      const typeMatch = line.match(/^(?:pub\s+)?(struct|enum|trait)\s+(\w+)/);
      if (typeMatch?.[2]) syms.push(`${typeMatch[1]} ${typeMatch[2]}`);
      if (syms.length >= 20) break;
    }
  } else if (ext === '.go') {
    for (const line of lines) {
      // Functions (regular and methods)
      const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/);
      if (funcMatch?.[1]) syms.push(`func ${funcMatch[1]}(...)`);
      // Types
      const typeMatch = line.match(/^type\s+(\w+)\s+(struct|interface)/);
      if (typeMatch?.[1]) syms.push(`${typeMatch[2]} ${typeMatch[1]}`);
      if (syms.length >= 20) break;
    }
  }

  return [...new Set(syms)];
}

function walk(dir: string, prefix: string, depth: number, maxDepth: number, lines: string[]): void {
  if (depth > maxDepth || lines.length >= 500) return;
  
  let entries: string[];
  try { entries = readdirSync(dir).sort(); } catch { return; }
  
  const dirs: string[] = [], files: string[] = [];
  for (const e of entries) {
    if (e.startsWith('.') && e !== '.env') continue;
    if (IGNORE.has(e)) continue;
    try { 
      const s = statSync(join(dir, e));
      s.isDirectory() ? dirs.push(e) : files.push(e); 
    } catch { /* skip */ }
  }

  for (const d of dirs) { 
    lines.push(`${prefix}📁 ${d}/`); 
    walk(join(dir, d), prefix + '  ', depth + 1, maxDepth, lines); 
  }

  for (const f of files.slice(0, 40)) {
    try {
      const fullPath = join(dir, f);
      const ext = f.includes('.') ? '.' + f.split('.').pop()! : '';
      const sz = statSync(fullPath).size;
      const kb = sz > 1024 ? `${(sz / 1024).toFixed(0)}k` : `${sz}b`;
      
      lines.push(`${prefix}📄 ${f}  ${chalk.dim(`(${kb})`)}`);
      
      if (CODE_EXTS.has(ext) && sz < 200_000) {
        let syms: string[] = [];
        const content = readFileSync(fullPath, 'utf8');
        
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          syms = extractTsSymbols(content, f);
        } else {
          syms = extractRegexSymbols(content, ext);
        }

        if (syms.length > 0) {
          // Limit symbols shown per file to keep map readable
          const displaySyms = syms.slice(0, 10);
          lines.push(`${prefix}  ${chalk.cyan('↳')} ${chalk.dim(displaySyms.join(', '))}${syms.length > 10 ? ' ...' : ''}`);
        }
      }
    } catch { 
      lines.push(`${prefix}📄 ${f}`); 
    }
  }
  
  if (files.length > 40) lines.push(`${prefix}  ... +${files.length - 40} more files`);
}

import chalk from 'chalk';

export function repoMapTool(input: Record<string, any>): ToolResult {
  try {
    const rootPath = resolve((input['path'] as string | undefined) ?? '.');
    const depth = (input['depth'] as number) ?? 3;
    const lines: string[] = [];
    
    lines.push(chalk.bold(`\nCodebase Map: ${rootPath}`));
    lines.push(chalk.dim('─'.repeat(50)));
    
    walk(rootPath, '', 0, depth, lines);
    
    return { 
      tool: 'repo_map', 
      result: lines.join('\n').slice(0, 25000) 
    };
  } catch (e) { 
    return { tool: 'repo_map', result: '', error: (e as Error).message }; 
  }
}
