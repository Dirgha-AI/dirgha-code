/** tools/browser/agent.ts — Agent-browser actions using Vercel agent-browser */
import type { ToolResult } from '../../types.js';
import { execAgentBrowser, truncateOutput } from './utils.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';

export function navigateAgent(url: string): ToolResult {
  try {
    execAgentBrowser(['open', url], 20000);
    const snapshot = execAgentBrowser(['snapshot', '-i', '-c'], 10000);
    const title = execAgentBrowser(['get', 'title'], 5000).trim();
    return { tool: 'browser', result: `URL: ${url}\nTitle: ${title}\n\n${truncateOutput(snapshot)}` };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function snapshotAgent(opts: any): ToolResult {
  try {
    const args = ['snapshot'];
    if (opts?.interactive) args.push('-i');
    if (opts?.compact) args.push('-c');
    if (opts?.depth) args.push('-d', String(opts.depth));
    if (opts?.selector) args.push('-s', opts.selector);
    return { tool: 'browser', result: truncateOutput(execAgentBrowser(args, 15000)) };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function clickAgent(selector: string): ToolResult {
  try {
    execAgentBrowser(['click', selector], 10000);
    const snapshot = execAgentBrowser(['snapshot', '-i'], 10000);
    return { tool: 'browser', result: `Clicked ${selector}\n\n${truncateOutput(snapshot)}` };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function typeAgent(selector: string, text: string): ToolResult {
  try {
    execAgentBrowser(['type', selector, text], 10000);
    const snapshot = execAgentBrowser(['snapshot', '-i'], 10000);
    return { tool: 'browser', result: `Typed "${text}" into ${selector}\n\n${truncateOutput(snapshot)}` };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function fillAgent(selector: string, text: string): ToolResult {
  try {
    execAgentBrowser(['fill', selector, text], 10000);
    const snapshot = execAgentBrowser(['snapshot', '-i'], 10000);
    return { tool: 'browser', result: `Filled ${selector} with "${text}"\n\n${truncateOutput(snapshot)}` };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function screenshotAgent(path?: string, annotate?: boolean): ToolResult {
  try {
    const outPath = path || join(tmpdir(), `dirgha_screenshot_${Date.now()}.png`);
    const args = ['screenshot', outPath];
    if (annotate) args.push('--annotate');
    const output = execAgentBrowser(args, 30000);
    return { tool: 'browser', result: `Screenshot: ${outPath}\n${output}` };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function findAgent(role: string, action?: string, name?: string): ToolResult {
  try {
    const args = ['find', 'role', role];
    if (action) args.push(action);
    if (name) args.push('--name', name);
    return { tool: 'browser', result: truncateOutput(execAgentBrowser(args, 10000)) };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function getAgent(info: string, selector?: string): ToolResult {
  try {
    const args = ['get', info];
    if (selector) args.push(selector);
    return { tool: 'browser', result: truncateOutput(execAgentBrowser(args, 5000)) };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function batchAgent(commands: string[][]): ToolResult {
  try {
    const tmpDir = mkdtempSync(join(tmpdir(), 'dirgha-batch-'));
    const jsonPath = join(tmpDir, 'commands.json');
    writeFileSync(jsonPath, JSON.stringify(commands));
    return { tool: 'browser', result: truncateOutput(execAgentBrowser(['batch', '--json'], 60000)) };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}

export function evalAgent(js: string): ToolResult {
  try {
    return { tool: 'browser', result: truncateOutput(execAgentBrowser(['eval', js], 10000)) };
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}
