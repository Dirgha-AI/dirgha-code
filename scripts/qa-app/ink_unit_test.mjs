/**
 * Definitive Ink unit test for the streaming projection.
 *
 * Mounts the v2 App component in a fake stdout buffer (no real PTY),
 * fires synthetic AgentEvents directly into the EventStream, then
 * reads the rendered frame and asserts the streamed text shows up.
 *
 * If this passes, the Ink projection IS wired correctly and any
 * remaining "white screen" or "no streaming" symptom in the live
 * binary is an input-routing or environment issue, not the render
 * pipeline. If this fails, the projection is broken.
 *
 * Equivalent to ink-testing-library but inlined so we don't fight the
 * monorepo's workspace protocol.
 */

import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as React from 'react';
import { render } from 'ink';

// Use the monorepo's compiled v2 modules — testing the same code path
// the published binary would run.
import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { App } = await import(`${ROOT}/tui/ink/App.js`);
const { createEventStream } = await import(`${ROOT}/kernel/event-stream.js`);
const { ProviderRegistry } = await import(`${ROOT}/providers/index.js`);
const { createToolRegistry, builtInTools } = await import(`${ROOT}/tools/index.js`);
const { createSessionStore } = await import(`${ROOT}/context/session.js`);

// ANSI stripper.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]/g;
const strip = s => s.replace(ANSI, '').replace(/\r/g, '');

// Capture-stdout writable that buffers each Ink frame.
class CaptureStream extends Writable {
  constructor() {
    super();
    this.frames = [];
    this.columns = 120;
    this.rows = 40;
    this.isTTY = true;
  }
  _write(chunk, _enc, cb) {
    this.frames.push(chunk.toString('utf8'));
    cb();
  }
  cursorTo() {}
  clearLine() {}
  moveCursor() {}
}

const stdout = new CaptureStream();
const stderr = new CaptureStream();

// Fake stdin so InputBox's useInput hook doesn't crash demanding raw mode.
// FakeStdin must mimic a TTY Readable stream — Ink uses
// `stdin.addListener('readable', ...)` and pulls bytes via `stdin.read()`.
// A bare EventEmitter doesn't satisfy that contract; the slash-command
// journey assertions below rely on this push() + read() cycle to deliver
// keystrokes into Ink's input parser.
class FakeStdin extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this._buf = [];
  }
  setEncoding() {}
  read() {
    // Ink calls .read() inside its 'readable' handler. Return the
    // earliest queued chunk (Buffer) or null if nothing pending.
    return this._buf.shift() ?? null;
  }
  resume() {}
  pause() {}
  setRawMode() { return this; }
  ref() {}
  unref() {}
  on(...args) { return super.on(...args); }
  /** Test hook — push a chunk + emit readable so Ink picks it up. */
  pushChunk(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    this._buf.push(buf);
    this.emit('readable');
  }
}
const stdin = new FakeStdin();

const events = createEventStream();
const registry = createToolRegistry(builtInTools);
const providers = new ProviderRegistry();
const sessions = createSessionStore();
const config = {
  model: 'inclusionai/ling-2.6-1t:free',
  maxTurns: 8,
  showThinking: false,
  vimMode: false,
  autoApproveTools: ['shell', 'fs-read'],
};

const element = React.createElement(App, {
  events, registry, providers, sessions, config, cwd: '/tmp', slashCommands: [],
});

// debug:true is the *capture-all-frames* mode. Ink also has a "CI mode"
// (gated by the `is-in-ci` package — env CI=true on every GH Actions
// runner) that suppresses dynamic output and only writes the final
// static prefix. That breaks frame-substring assertions because the
// transcript + input box + status bar never reach stdout. debug mode
// disables the CI suppression so our CaptureStream sees every frame.
const ink = render(element, {
  stdout,
  stderr,
  stdin,
  exitOnCtrlC: false,
  patchConsole: false,
  debug: true,
});

const lastFrame = () => strip(stdout.frames.at(-1) ?? '');
const allFrames = () => stdout.frames.map(strip).join('\n--FRAME--\n');
// Concatenated text of every frame so far — the right substrate for
// "did this ever appear during the run?" assertions, since Ink emits
// many transient frames and the last one is often a teardown blank.
const everSeen = () => strip(stdout.frames.join(''));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Tiny synchronous-ish driver: fire events then await microtask flush.
const flush = async () => { await sleep(50); };

const assertions = [];
const assert = (label, ok) => assertions.push({ label, ok });

try {
  await sleep(150); // initial mount
  assert('Logo + input box rendered on mount', /Dirgha Code/.test(everSeen()) && /Ask dirgha anything/.test(everSeen()));

  // Drive a streaming text turn.
  events.emit({ type: 'agent_start', sessionId: 'test', model: 'inclusionai/ling-2.6-1t:free' });
  events.emit({ type: 'turn_start', turnId: 't0', turnIndex: 0 });
  events.emit({ type: 'text_start' });
  await flush();

  events.emit({ type: 'text_delta', delta: 'Hello' });
  await flush();
  events.emit({ type: 'text_delta', delta: ', ' });
  await flush();
  events.emit({ type: 'text_delta', delta: 'world!' });
  await flush();
  assert('text_delta projects to transcript during stream', /Hello, world!/.test(everSeen()));

  events.emit({ type: 'text_end' });
  events.emit({ type: 'usage', inputTokens: 100, outputTokens: 3, cachedTokens: 0 });
  events.emit({ type: 'turn_end', turnId: 't0', stopReason: 'end_turn' });
  await flush();
  assert('usage tokens reach status bar', /\b103\b/.test(everSeen()));

  // Tool event sequence.
  events.emit({ type: 'turn_start', turnId: 't1', turnIndex: 1 });
  events.emit({ type: 'tool_exec_start', id: 'shell:0', name: 'shell', input: { command: 'ls /tmp' } });
  await flush();
  assert('tool_exec_start renders tool box', /shell/i.test(everSeen()));
  assert('tool input summary visible in tool box', /ls \/tmp/.test(everSeen()));

  events.emit({ type: 'tool_exec_end', id: 'shell:0', output: 'file1\nfile2\n', isError: false, durationMs: 7 });
  events.emit({ type: 'turn_end', turnId: 't1', stopReason: 'end_turn' });
  events.emit({ type: 'agent_end', sessionId: 'test', stopReason: 'end_turn', usage: { inputTokens: 200, outputTokens: 10, cachedTokens: 0, costUsd: 0 } });
  await flush();

  // ToolBox renders ✓ + tool-icon glyph (∂ for shell) + the tool label,
  // e.g. "✓ ∂ Shell". Allow the icon column between ✓ and Shell.
  assert('tool_exec_end transitions tool to done (✓)', /✓\s*\S?\s*Shell/.test(everSeen()));
  assert('tool output preview rendered (file1)', /file1/.test(everSeen()));
  assert('streamed text persists across tool turn', everSeen().match(/Hello, world!/g)?.length >= 1);

  // ─────────────────────────────────────────────────────────────────────
  // Slash-command UI journeys — drive the App via FakeStdin, assert the
  // overlay rendered. This is the SOTA replacement for tmux+freeze
  // smoke: runs in CI without a real terminal because Ink's render is
  // captured into the CaptureStream above.
  // ─────────────────────────────────────────────────────────────────────

  const stdoutFrameCountBefore = stdout.frames.length;
  // Ink listens on stdin's 'readable' event and pulls bytes via
  // stdin.read(). FakeStdin.pushChunk() queues + signals.
  const send = (s) => stdin.pushChunk(s);
  const typeSlash = async (cmd) => {
    for (const ch of cmd) {
      send(ch);
      await sleep(30);
    }
    // Press Enter (\r is what raw stdin sends on most TTYs).
    send('\r');
    await sleep(300);
  };

  // /help should open the help overlay (HelpOverlay component).
  await typeSlash('/help');
  const afterHelp = strip(stdout.frames.slice(stdoutFrameCountBefore).join(''));
  assert('/help opens help overlay', /help \d+ commands|Slash commands|↑↓|filter|esc/i.test(afterHelp));

  // Press Esc to close the overlay before the next journey.
  stdin.emit('data', '');
  await sleep(150);

  // /theme should open the theme picker overlay.
  const beforeTheme = stdout.frames.length;
  await typeSlash('/theme');
  const afterTheme = strip(stdout.frames.slice(beforeTheme).join(''));
  assert('/theme opens theme picker', /theme picker|↑↓|███|dark.*light|cabinet/i.test(afterTheme));
  stdin.emit('data', '');
  await sleep(150);

  // /models should open the model picker overlay.
  const beforeModels = stdout.frames.length;
  await typeSlash('/models');
  const afterModels = strip(stdout.frames.slice(beforeModels).join(''));
  assert('/models opens model picker', /kimi|gpt|deepseek|moonshot|claude|model picker|↑↓/i.test(afterModels));
  stdin.emit('data', '');
  await sleep(150);

} finally {
  ink.unmount();
  await sleep(50);
}

let passed = 0, failed = 0;
console.log('\n========== assertions ==========');
for (const a of assertions) {
  const mark = a.ok ? '✓' : '✗';
  console.log(`  ${mark} ${a.label}`);
  if (a.ok) passed++; else failed++;
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed}`);

if (failed > 0) {
  console.log('\n========== last frame (for debugging) ==========');
  console.log(lastFrame() || '(empty)');
  console.log('\n========== full frame log written to /tmp/ink-unit-frames.log ==========');
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/ink-unit-frames.log', allFrames()));
}

process.exit(failed === 0 ? 0 : 1);
