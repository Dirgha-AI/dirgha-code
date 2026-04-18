// @ts-nocheck
/**
 * python.ts — Syntax highlighting patterns for Python
 */

import { SyntaxPattern } from '../types.js';
import { C } from '../../../colors.js';

export const pythonPatterns: SyntaxPattern[] = [
  {
    pattern: /\b(def|class|import|from|as|return|if|elif|else|for|while|try|except|raise|with|async|await|lambda|None|True|False)\b/g,
    color: C.accent,
  },
  { pattern: /#.*/g, color: C.textFaint },
  { pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, color: C.textFaint },
  { pattern: /f'[^']*'|f"[^"]*"/g, color: '#f1fa8c' },
];
