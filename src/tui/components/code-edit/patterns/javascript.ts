/**
 * javascript.ts — Syntax highlighting patterns for JavaScript
 */

import { SyntaxPattern } from '../types.js';
import { C } from '../../../colors.js';

export const javascriptPatterns: SyntaxPattern[] = [
  {
    pattern: /\b(import|export|from|const|let|var|function|class|return|if|else|for|while|async|await|try|catch|throw|new|this)\b/g,
    color: C.accent,
  },
  {
    pattern: /\b(null|undefined|true|false)\b/g,
    color: '#ff79c6',
  },
  { pattern: /\/\/.*$/gm, color: C.textFaint },
  { pattern: /`[^`]*`|'[^']*'|"[^"]*"/g, color: '#f1fa8c' },
];
