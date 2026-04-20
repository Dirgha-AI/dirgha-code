/**
 * typescript.ts — Syntax highlighting patterns for TypeScript
 */

import { SyntaxPattern } from '../types.js';
import { C } from '../../../colors.js';

export const typescriptPatterns: SyntaxPattern[] = [
  {
    pattern: /\b(import|export|from|const|let|var|function|class|interface|type|return|if|else|for|while|async|await|try|catch|throw|new|this)\b/g,
    color: C.accent,
  },
  {
    pattern: /\b(string|number|boolean|any|void|never|unknown|null|undefined|true|false)\b/g,
    color: '#ff79c6',
  },
  { pattern: /\/\/.*$/gm, color: C.textFaint },
  { pattern: /\/\*[\s\S]*?\*\//g, color: C.textFaint },
  { pattern: /`[^`]*`/g, color: '#f1fa8c' },
  { pattern: /'[^']*'|"[^"]*"/g, color: '#f1fa8c' },
  { pattern: /\b\d+\b/g, color: '#bd93f9' },
];
