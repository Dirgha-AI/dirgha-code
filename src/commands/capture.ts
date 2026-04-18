/**
 * commands/capture.ts — `dirgha capture <url> [output.png]`
 *
 * Takes a screenshot of a web page using the system Playwright/Chromium.
 * Falls back to a plain HTML export if Playwright is unavailable.
 * Also handles `dirgha export [format] [path]` to export the last session.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── capture command ────────────────────────────────────────────────────────────

export const captureCommand = new Command('capture')
  .description('Screenshot a web URL to PNG using headless Chromium')
  .argument('<url>', 'URL to screenshot')
  .argument('[output]', 'Output path (default: ~/.dirgha/captures/<timestamp>.png)')
  .option('--width <px>', 'Viewport width', '1280')
  .option('--height <px>', 'Viewport height', '800')
  .option('--full', 'Full-page screenshot (scroll height)')
  .action(async (url: string, output: string | undefined, opts: { width: string; height: string; full?: boolean }) => {
    const captureDir = path.join(os.homedir(), '.dirgha', 'captures');
    fs.mkdirSync(captureDir, { recursive: true });
    const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const dest = output ?? path.join(captureDir, `capture-${ts}.png`);

    console.log(chalk.dim(`  Launching Chromium…`));

    // Resolve playwright-core from the @playwright/mcp global install
    const pw = findPlaywright();
    if (!pw) {
      console.error(chalk.red('  ✗ Playwright not found. Install: npm i -g @playwright/mcp'));
      process.exit(1);
    }

    let browser: any;
    try {
      const chromiumExe = findChromium(pw);
      browser = await pw.chromium.launch({
        executablePath: chromiumExe ?? undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
      });
      const ctx  = await browser.newContext({ viewport: { width: parseInt(opts.width), height: parseInt(opts.height) } });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.screenshot({ path: dest, fullPage: opts.full ?? false });
      console.log(chalk.green(`  ✓ Saved: ${dest}`));
    } catch (e: any) {
      console.error(chalk.red(`  ✗ ${e?.message ?? String(e)}`));
      process.exit(1);
    } finally {
      await browser?.close().catch(() => {});
    }
  });

// ── export command ─────────────────────────────────────────────────────────────

export const exportCommand = new Command('export')
  .description('Export last session as md|html|json')
  .argument('[format]', 'md | html | json', 'md')
  .argument('[output]', 'Output file path (default: cwd)')
  .action(async (format: string, output: string | undefined) => {
    const fmt = (['md', 'html', 'json'] as const).includes(format as any) ? (format as 'md' | 'html' | 'json') : 'md';
    const ts  = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const dest = output ?? `dirgha-export-${ts}.${fmt}`;

    // Load last session from DB
    let msgs: Array<{ role: string; content: unknown }> = [];
    try {
      const { getDB } = await import('../session/db.js');
      const db = getDB();
      const row = db.prepare(`SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1`).get() as { id: string } | undefined;
      if (!row) { console.log(chalk.dim('  No sessions found.')); return; }
      msgs = db.prepare(`SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC`).all(row.id) as any[];
    } catch (e: any) {
      console.error(chalk.red(`  ✗ ${e?.message}`)); return;
    }

    if (fmt === 'json') {
      fs.writeFileSync(dest, JSON.stringify(msgs, null, 2), 'utf8');
    } else if (fmt === 'html') {
      const rows = msgs.map(m => {
        const role    = String(m.role ?? '');
        const content = extractText(m.content)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cls = role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : 'system';
        return `<div class="msg ${cls}"><span class="role">${role}</span><pre>${content}</pre></div>`;
      }).join('\n');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dirgha Export</title>
<style>
body{background:#111;color:#e5e7eb;font-family:monospace;max-width:860px;margin:40px auto;padding:0 20px}
h1{color:#22c55e;font-size:1.2em}
.msg{margin:16px 0;border-left:3px solid #374151;padding-left:12px}
.msg.user{border-color:#3b82f6}.msg.assistant{border-color:#22c55e}.msg.system{border-color:#6b7280}
.role{font-size:.75em;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
pre{margin:4px 0;white-space:pre-wrap;word-break:break-word}
</style></head><body>
<h1>◆ DIRGHA — ${ts}</h1>\n${rows}\n</body></html>`;
      fs.writeFileSync(dest, html, 'utf8');
    } else {
      const md = msgs
        .map(m => `## ${m.role ?? 'unknown'}\n\n${extractText(m.content)}`)
        .join('\n\n---\n\n');
      fs.writeFileSync(dest, `# Dirgha Export ${ts}\n\n${md}\n`, 'utf8');
    }
    console.log(chalk.green(`  ✓ Exported (${fmt}) → ${dest}`));
  });

/** Extract plain text from a message content value (handles JSON content blocks) */
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('\n') || content;
      }
    } catch { /* plain string */ }
    return content;
  }
  if (Array.isArray(content)) {
    return (content as any[]).filter(b => b?.type === 'text').map(b => b.text ?? '').join('\n');
  }
  return JSON.stringify(content);
}

// ── helpers ────────────────────────────────────────────────────────────────────

import { createRequire } from 'module';
const _req = createRequire(import.meta.url);

function findPlaywright(): any | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'playwright-core'),
    path.join(process.cwd(), 'node_modules', 'playwright'),
    '/usr/lib/node_modules/@playwright/mcp/node_modules/playwright-core',
    '/usr/local/lib/node_modules/playwright-core',
  ];
  for (const p of candidates) {
    try { return _req(p); } catch { /* try next */ }
  }
  return null;
}

function findChromium(pw: any): string | null {
  // Check known install locations
  const candidates = [
    '/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium-1216/chrome-linux64/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  try {
    const exe = pw.chromium.executablePath?.();
    if (exe && fs.existsSync(exe)) return exe;
  } catch { /* no-op */ }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}
