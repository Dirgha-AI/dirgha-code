/**
 * /paste — pull the OS clipboard's image (or text) into the next user
 * turn. Closes Gap C from docs/audit/2026-04-28-cursor-bolt-parity.md.
 *
 * Most modern terminals (kitty, iTerm2, WezTerm) handle image paste via
 * OSC 52 escapes that arrive as one big keypress. Ink's input parser
 * treats them as garbled text. Until we add a real OSC 52 handler in
 * the input loop, /paste is the first-class fallback that works on
 * every terminal: it shells out to the platform clipboard tool to
 * retrieve the image bytes.
 *
 * On match: writes the image to a temp file, returns a short note
 * pointing the user at the path. The next user turn can then reference
 * the path (the multimodal handler picks up image_url:// content).
 *
 * On no clipboard tool found: returns a hint listing the supported
 * tools so the user knows what to install.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SlashCommand } from './types.js';

interface ClipboardImage {
  ok: true;
  path: string;
  bytes: number;
  mime: string;
}
interface ClipboardText {
  ok: true;
  text: string;
}
interface ClipboardError {
  ok: false;
  error: string;
}
type ClipboardResult = ClipboardImage | ClipboardText | ClipboardError;

/** Try every known clipboard tool until one succeeds. */
function readClipboardImage(): ClipboardResult {
  const plat = platform();
  // macOS — pngpaste retrieves an image; falls back to pbpaste (text).
  if (plat === 'darwin') {
    const tmp = join(tmpdir(), `dirgha-paste-${randomUUID()}.png`);
    const png = spawnSync('pngpaste', [tmp]);
    if (png.status === 0) {
      const bytes = Buffer.from('').length;  // we'll stat below
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        const st = fs.statSync(tmp);
        return { ok: true, path: tmp, bytes: st.size, mime: 'image/png' };
      } catch { /* fall through */ }
    }
    const txt = spawnSync('pbpaste', [], { encoding: 'utf8' });
    if (txt.status === 0 && typeof txt.stdout === 'string' && txt.stdout.length > 0) {
      return { ok: true, text: txt.stdout };
    }
    return { ok: false, error: 'macOS: install `pngpaste` (brew install pngpaste) to paste images. Text paste needs `pbpaste`.' };
  }
  // Linux Wayland → wl-paste
  if (plat === 'linux') {
    const tmp = join(tmpdir(), `dirgha-paste-${randomUUID()}.png`);
    const wl = spawnSync('wl-paste', ['--type', 'image/png', '-o', tmp]);
    if (wl.status === 0) {
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        const st = fs.statSync(tmp);
        if (st.size > 0) return { ok: true, path: tmp, bytes: st.size, mime: 'image/png' };
      } catch { /* */ }
    }
    // X11 → xclip image target
    const xc = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'], { encoding: 'buffer' });
    if (xc.status === 0 && Buffer.isBuffer(xc.stdout) && xc.stdout.length > 100) {
      writeFileSync(tmp, xc.stdout);
      return { ok: true, path: tmp, bytes: xc.stdout.length, mime: 'image/png' };
    }
    // Fallback to text
    const wlText = spawnSync('wl-paste', [], { encoding: 'utf8' });
    if (wlText.status === 0 && wlText.stdout) return { ok: true, text: wlText.stdout };
    const xcText = spawnSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8' });
    if (xcText.status === 0 && xcText.stdout) return { ok: true, text: xcText.stdout };
    return { ok: false, error: 'Linux: install `wl-paste` (Wayland: wl-clipboard pkg) or `xclip` (X11). For image paste both must be present.' };
  }
  // Windows — clip.exe is OUTPUT-only; image paste needs PowerShell.
  if (plat === 'win32') {
    const tmp = join(tmpdir(), `dirgha-paste-${randomUUID()}.png`);
    const ps = spawnSync('powershell.exe', ['-Command', `Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $img.Save('${tmp.replace(/'/g, "''")}'); Write-Host 'OK' } else { Write-Host 'NOIMAGE' }`], { encoding: 'utf8' });
    if (ps.status === 0 && /OK/.test(ps.stdout || '')) {
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        const st = fs.statSync(tmp);
        return { ok: true, path: tmp, bytes: st.size, mime: 'image/png' };
      } catch { /* */ }
    }
    // Text fallback
    const txt = spawnSync('powershell.exe', ['-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' });
    if (txt.status === 0 && typeof txt.stdout === 'string' && txt.stdout.length > 0) {
      return { ok: true, text: txt.stdout };
    }
    return { ok: false, error: 'Windows: PowerShell clipboard read failed. Make sure something is copied first.' };
  }
  return { ok: false, error: `unsupported platform: ${plat}` };
}

/**
 * Persist a "pending paste" pointer the next chat turn picks up. Lives
 * at ~/.dirgha/pending-paste so the multimodal handler in
 * src_v2/cli/main.ts (or downstream) can prepend the image_url part on
 * the next user turn. Idempotent — overwritten on each call.
 */
function recordPending(result: ClipboardImage | ClipboardText): void {
  const dir = join(homedir(), '.dirgha');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'pending-paste.json');
  const body = 'path' in result
    ? { kind: 'image', path: result.path, mime: result.mime, bytes: result.bytes, ts: new Date().toISOString() }
    : { kind: 'text', text: result.text.slice(0, 4000), ts: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(body, null, 2));
}

export const pasteCommand: SlashCommand = {
  name: 'paste',
  description: 'Paste from system clipboard (image or text) into the next turn',
  async execute(_args, _ctx) {
    const r = readClipboardImage();
    if (!r.ok) return `clipboard: ${r.error}`;
    recordPending(r);
    if ('path' in r) {
      return `clipboard image attached (${(r.bytes / 1024).toFixed(1)} KB ${r.mime}). It will be sent with your next message.\nFile: ${r.path}`;
    }
    return `clipboard text attached (${r.text.length} chars). It will be sent with your next message.`;
  },
};
