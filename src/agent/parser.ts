/**
 * agent/parser.ts — Parse agent mode input (CLI-Anything style).
 * Handles --json, --input file, and raw arguments.
 */
import { readFileSync } from 'fs';
import type { AgentInput } from './types.js';

/** Parse command line for agent mode. */
export function parseAgentArgs(rawArgs: string[]): AgentInput {
  const args: Record<string, unknown> = {};
  const flags: Record<string, unknown> = {};
  let command = '';
  
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    
    // Long flag: --flag or --flag=value
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = parseValue(value);
      } else {
        const key = arg.slice(2);
        // Check if next arg is value (not a flag)
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[key] = parseValue(rawArgs[i + 1]);
          i++;
        } else {
          flags[key] = true;
        }
      }
    }
    // Short flag: -f or -f value
    else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        flags[key] = parseValue(rawArgs[i + 1]);
        i++;
      } else {
        flags[key] = true;
      }
    }
    // Command (first non-flag)
    else if (!command) {
      command = arg;
    }
    // Positional arg
    else {
      const argKeys = Object.keys(args);
      args[argKeys.length === 0 ? 'message' : `arg${argKeys.length}`] = arg;
    }
    i++;
  }

  return { command, args, flags, raw: rawArgs.join(' ') };
}

function parseValue(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (/^\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

/** Load input from JSON file (for complex agent requests). */
export function loadInputFile(path: string): AgentInput {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}
