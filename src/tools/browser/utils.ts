/** tools/browser/utils.ts — Shared utilities for browser tool */
import { spawnSync, execSync } from 'node:child_process';

export const MAX_OUTPUT = 50000;
export const AGENT_BROWSER = 'agent-browser';

export function isAgentBrowserInstalled(): boolean {
  try {
    execSync('agent-browser --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function execAgentBrowser(args: string[], timeout = 30000): string {
  const r = spawnSync(AGENT_BROWSER, args, { 
    encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024
  });
  if (r.status !== 0) throw new Error(r.stderr || `Exit code ${r.status}`);
  return r.stdout || '';
}

export function truncateOutput(text: string, max = MAX_OUTPUT): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[Truncated: ${text.length - max} chars]`;
}
