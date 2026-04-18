// @ts-nocheck
/**
 * patterns/index.ts — Language pattern registry
 */

import { SyntaxPattern } from '../types.js';
import { typescriptPatterns } from './typescript.js';
import { javascriptPatterns } from './javascript.js';
import { pythonPatterns } from './python.js';
import { C } from '../../../colors.js';

export const LANGUAGE_PATTERNS: Record<string, SyntaxPattern[]> = {
  typescript: typescriptPatterns,
  javascript: javascriptPatterns,
  python: pythonPatterns,
  markdown: [
    { pattern: /^#+\s+/gm, color: C.accent },
    { pattern: /\*\*[^*]+\*\*/g, color: '#ff79c6' },
    { pattern: /`[^`]+`/g, color: '#f1fa8c' },
    { pattern: /^[\s]*[-*+]\s/gm, color: C.accent },
  ],
  json: [
    { pattern: /"[^"]+":/g, color: '#ff79c6' },
    { pattern: /true|false|null/g, color: '#bd93f9' },
    { pattern: /\b\d+\b/g, color: '#bd93f9' },
  ],
  yaml: [
    { pattern: /^[\w-]+:/gm, color: '#ff79c6' },
    { pattern: /true|false|null/g, color: '#bd93f9' },
    { pattern: /#.*/g, color: C.textFaint },
  ],
};

export function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', pyw: 'python', md: 'markdown', mdx: 'markdown',
    json: 'json', yaml: 'yaml', yml: 'yaml',
  };
  return map[ext] || 'text';
}
