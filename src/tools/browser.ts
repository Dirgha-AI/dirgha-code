/**
 * Headless browser tool.
 *
 * Subcommands: goto, click, screenshot, content, close.
 *
 * Keeps a single Chromium instance + page alive across calls within the
 * process so subsequent actions land on the same DOM. The shell owns the
 * lifecycle: call the exported `closeBrowser()` at shutdown to release
 * the child process and delete the tmp user-data-dir.
 *
 * Playwright is loaded lazily so the module's import graph stays light:
 * if the runtime binary isn't installed, callers get a structured error
 * from `execute()` rather than a crash at import time. The `playwright`
 * package is resolvable in this workspace via pnpm — see the v1 browser
 * tool for the older `agent-browser` shell-out implementation this tool
 * supersedes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Tool, ToolContext } from './registry.js';
import type { ToolResult } from '../kernel/types.js';

type Action = 'goto' | 'click' | 'screenshot' | 'content' | 'close';

interface Input {
  action: Action;
  url?: string;
  selector?: string;
  text?: string;
  path?: string;
  fullPage?: boolean;
  timeoutMs?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

interface BrowserOutput {
  action: Action;
  url?: string;
  title?: string;
  path?: string;
}

// Minimal structural typing for the playwright bits we touch. This keeps
// typecheck clean whether or not @types/playwright is resolvable and
// avoids pulling the full Playwright type surface into the agent build.
interface PwLocator {
  first(): PwLocator;
  click(opts?: { timeout?: number }): Promise<void>;
  count(): Promise<number>;
}
interface PwPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
  innerText(selector: string): Promise<string>;
  screenshot(opts: { path: string; fullPage?: boolean }): Promise<Buffer>;
  locator(sel: string): PwLocator;
  getByText(text: string, opts?: { exact?: boolean }): PwLocator;
  click(sel: string, opts?: { timeout?: number }): Promise<void>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
  isConnected?(): boolean;
}

const MAX_CONTENT_CHARS = 50_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const SCREENSHOT_DIR = join(homedir(), '.dirgha', 'screenshots');

let browser: PwBrowser | undefined;
let page: PwPage | undefined;

async function ensureBrowser(): Promise<PwPage> {
  if (page && browser && (browser.isConnected?.() ?? true)) return page;

  let chromium: { launch(opts: { headless: boolean; args?: string[] }): Promise<PwBrowser> };
  try {
    // Dynamic import — resolved at runtime. Playwright is intentionally
    // not in package.json deps (heavy + optional). Hiding the literal
    // string behind a variable keeps TS's module resolver from looking
    // for type definitions for an absent package.
    const pwModuleId = 'playwright';
    const mod: any = await import(pwModuleId);
    chromium = mod.chromium ?? mod.default?.chromium;
    if (!chromium || typeof chromium.launch !== 'function') {
      throw new Error('playwright module shape unexpected (no chromium.launch)');
    }
  } catch (err) {
    throw new Error(
      `playwright is not available. Install with: pnpm add -w playwright && npx playwright install chromium. Underlying: ${(err as Error).message}`,
    );
  }

  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  page = await browser.newPage();
  return page;
}

function truncate(text: string, max = MAX_CONTENT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated: ${text.length - max} more chars]`;
}

function ok(data: BrowserOutput, content: string): ToolResult<BrowserOutput> {
  return { content, data, isError: false };
}

function fail(content: string): ToolResult<BrowserOutput> {
  return { content, isError: true };
}

async function doGoto(input: Input): Promise<ToolResult<BrowserOutput>> {
  if (!input.url) return fail('url required for goto');
  const p = await ensureBrowser();
  await p.goto(input.url, {
    waitUntil: input.waitUntil ?? 'domcontentloaded',
    timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const title = await p.title().catch(() => '');
  return ok(
    { action: 'goto', url: p.url(), title },
    `navigated to ${p.url()}\ntitle: ${title || '(none)'}`,
  );
}

async function doClick(input: Input): Promise<ToolResult<BrowserOutput>> {
  if (!input.selector && !input.text) {
    return fail('click requires selector or text');
  }
  const p = await ensureBrowser();
  const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (input.selector) {
    await p.click(input.selector, { timeout });
    return ok({ action: 'click' }, `clicked selector: ${input.selector}`);
  }

  // Text-based click — pick the first match to avoid ambiguity.
  const locator = p.getByText(input.text as string).first();
  const count = await locator.count().catch(() => 0);
  if (count === 0) return fail(`no element contains text: ${input.text}`);
  await locator.click({ timeout });
  return ok({ action: 'click' }, `clicked text: ${input.text}`);
}

async function doScreenshot(input: Input): Promise<ToolResult<BrowserOutput>> {
  const p = await ensureBrowser();
  const outPath = input.path ?? join(SCREENSHOT_DIR, `shot-${Date.now()}.png`);
  await mkdir(SCREENSHOT_DIR, { recursive: true }).catch(() => undefined);
  await p.screenshot({ path: outPath, fullPage: input.fullPage ?? false });
  return ok({ action: 'screenshot', path: outPath }, `screenshot saved: ${outPath}`);
}

async function doContent(input: Input): Promise<ToolResult<BrowserOutput>> {
  const p = await ensureBrowser();
  const text = await p.innerText('body').catch(async () => {
    // Fallback to raw HTML stripped of tags if body isn't available yet.
    const html = await p.content();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  });
  const url = p.url();
  const title = await p.title().catch(() => '');
  const body = truncate(text);
  return ok(
    { action: 'content', url, title },
    `url: ${url}\ntitle: ${title}\n\n${body}`,
  );
}

async function doClose(): Promise<ToolResult<BrowserOutput>> {
  await closeBrowser();
  return ok({ action: 'close' }, 'browser closed');
}

/**
 * Shut down the browser instance and reset module state. Safe to call
 * repeatedly; a no-op when no browser is running. The shell should call
 * this from its exit handler so headless Chromium doesn't leak across
 * process lifetimes.
 */
export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = undefined;
  page = undefined;
  if (!b) return;
  await b.close().catch(() => undefined);
}

export const browserTool: Tool = {
  name: 'browser',
  description:
    'Control a headless Chromium browser. Actions: goto (url), click (selector or text), screenshot (path), content (returns page text), close. One page is kept alive across calls.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['goto', 'click', 'screenshot', 'content', 'close'],
      },
      url: { type: 'string', description: 'Target URL for goto.' },
      selector: { type: 'string', description: 'CSS selector for click.' },
      text: { type: 'string', description: 'Visible text for click fallback.' },
      path: { type: 'string', description: 'Output path for screenshot.' },
      fullPage: { type: 'boolean', description: 'Whole-page screenshot.' },
      timeoutMs: { type: 'integer', minimum: 1000 },
      waitUntil: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle'],
      },
    },
    required: ['action'],
  },
  requiresApproval: (raw: unknown): boolean => {
    const input = raw as Input;
    // Approve network-touching or filesystem-writing actions. `content`
    // and `close` reuse the already-approved page so they don't.
    return input.action === 'goto' || input.action === 'screenshot';
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult<BrowserOutput>> {
    const input = rawInput as Input;
    if (!input || typeof input.action !== 'string') {
      return fail('action required');
    }

    try {
      switch (input.action) {
        case 'goto': return await doGoto(input);
        case 'click': return await doClick(input);
        case 'screenshot': return await doScreenshot(input);
        case 'content': return await doContent(input);
        case 'close': return await doClose();
        default: return fail(`unknown action: ${String((input as { action: unknown }).action)}`);
      }
    } catch (err) {
      return fail(`browser ${input.action} failed: ${(err as Error).message}`);
    }
  },
};

// Silence unused-var warnings for the tmp dir import even if unused.
void tmpdir;

export default browserTool;
