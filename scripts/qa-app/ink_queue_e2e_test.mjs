/**
 * End-to-end test for the prompt-queue UX with a stallable stub provider.
 *
 * The stub yields a few stream events then awaits an external promise,
 * keeping `busy=true` indefinitely. We submit a follow-up prompt while
 * the turn is still streaming and assert:
 *   - the queue indicator renders with the correct count
 *   - the buffer clears after Enter (so the user can keep typing)
 *   - releasing the stall and finishing the turn drains the queue
 */

import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as React from 'react';
import { render } from 'ink';
import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';

const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const _imp = (rel) => import(_toUrl(_join(ROOT, rel)).href);
const { App } = await _imp('tui/ink/App.js');
const { createEventStream } = await _imp('kernel/event-stream.js');
const { createToolRegistry, builtInTools } = await _imp('tools/index.js');
const { createSessionStore } = await _imp('context/session.js');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]/g;
const strip = s => s.replace(ANSI, '').replace(/\r/g, '');

class CaptureStream extends Writable {
  constructor() { super(); this.frames = []; this.columns = 120; this.rows = 40; this.isTTY = true; }
  _write(c, _e, cb) { this.frames.push(c.toString('utf8')); cb(); }
  cursorTo() {} clearLine() {} moveCursor() {}
}
class FakeStdin extends EventEmitter {
  constructor() { super(); this.isTTY = true; this._buf = []; }
  setEncoding() {}
  read() { return this._buf.shift() ?? null; }
  resume() {} pause() {}
  setRawMode() { return this; }
  ref() {} unref() {}
  pushChunk(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    this._buf.push(buf);
    this.emit('readable');
  }
}

const stdout = new CaptureStream();
const stderr = new CaptureStream();
const stdin = new FakeStdin();
const events = createEventStream();
const registry = createToolRegistry(builtInTools);
const sessions = createSessionStore();

// Stallable stub provider — keeps `busy` true until we resolve `release`.
let release;
const released = new Promise(r => { release = r; });
const stubProvider = {
  id: 'stub',
  supportsTools: () => false,
  supportsThinking: () => false,
  async *stream(_req) {
    yield { type: 'agent_start', sessionId: 'stub', model: 'stub' };
    yield { type: 'turn_start', turnId: 't0', turnIndex: 0 };
    yield { type: 'text_start' };
    yield { type: 'text_delta', delta: 'streaming first turn…' };
    await released; // hold busy=true here
    yield { type: 'text_end' };
    yield { type: 'turn_end', turnId: 't0', stopReason: 'end_turn' };
    yield { type: 'agent_end', sessionId: 'stub', stopReason: 'end_turn',
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 } };
  },
};
const stubRegistry = { forModel: () => stubProvider };

const config = {
  model: 'stub-model',
  maxTurns: 4,
  showThinking: false,
  vimMode: false,
  autoApproveTools: ['shell', 'fs-read'],
};

const element = React.createElement(App, {
  events, registry, providers: stubRegistry, sessions, config, cwd: '/tmp', slashCommands: [],
});
const ink = render(element, {
  stdout, stderr, stdin,
  exitOnCtrlC: false, patchConsole: false, debug: true,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const flush = async () => { await sleep(80); };
const lastFrame = () => strip(stdout.frames.at(-1) ?? '');
const everSeen = () => strip(stdout.frames.join(''));
const allFrames = () => stdout.frames.map(strip).join('\n--FRAME--\n');
const send = (s) => stdin.pushChunk(s);

const assertions = [];
const assert = (label, ok, hint) => assertions.push({ label, ok, hint });

let exited = false;
const origExit = process.exit;
process.exit = (_c) => { exited = true; };

try {
  await sleep(180);

  // Submit first prompt → kicks off the stalling stub turn.
  for (const ch of 'first prompt') { send(ch); await sleep(15); }
  send('\r');
  await sleep(400);

  assert('first prompt entered transcript',
    /first prompt/.test(everSeen()),
    'expected first prompt to render as a user transcript item');

  assert('stub provider stream is being consumed',
    /streaming first turn/.test(everSeen()),
    'text_delta from the stub never reached the projection');

  // Now type a second prompt while the turn is still busy and submit.
  for (const ch of 'second prompt while busy') { send(ch); await sleep(30); }
  await flush();
  send('\r');
  await flush();
  await flush();
  await flush(); // extra tick: allow React deferred render of queue indicator

  const frameAfterQueue = lastFrame();
  assert('queue indicator renders count when 1 prompt is queued',
    /queued \(1\)/.test(frameAfterQueue),
    `expected 'queued (1)' — last frame:\n${frameAfterQueue}`);
  assert('queued prompt body shown in the indicator',
    // TTY rendering in headless mode may displace the first character (CR artefact).
    // Check a mid-string substring that survives the garbling.
    /econd prompt while busy|second prompt while busy/.test(frameAfterQueue),
    'expected the queued prompt text to appear in the indicator');
  assert('input buffer cleared after queue submit',
    !new RegExp(`❯ second prompt while busy`).test(frameAfterQueue),
    'input box should be empty after Enter — found queued text still in box');

  // Type and queue a third one to verify the count bumps.
  for (const ch of 'third one') { send(ch); await sleep(30); }
  send('\r');
  await flush();
  await flush();
  assert('queue indicator updates count when a second prompt is queued',
    /queued \(2\)/.test(lastFrame()),
    `expected 'queued (2)' — last frame:\n${lastFrame()}`);

  // Release the stall — busy flips false, drain effect runs, queue empties.
  release();
  // The drain re-submits queued[0], which kicks off another stub turn.
  // That stub-stream awaits `released` which is already resolved, so it
  // resolves promptly. After both queued prompts have been popped, the
  // queue indicator should disappear.
  await sleep(800);
  assert('queue drains FIFO after busy clears',
    !/queued \(/.test(lastFrame()),
    `expected queue to be empty — last frame:\n${lastFrame()}`);

  // Both queued prompts should have surfaced as user transcript items.
  assert('queued prompts both ran (transcript shows both)',
    // TTY CR artefact may displace the first character; match both clean and garbled forms.
    (/second prompt while busy|econd prompt while busy/.test(everSeen())) &&
    (/third one|hird one/.test(everSeen())),
    'one or both queued prompts never made it into the transcript');

  assert('process did not exit during the queue lifecycle',
    exited === false,
    'process.exit was called unexpectedly');

} finally {
  process.exit = origExit;
  ink.unmount();
  await sleep(50);
}

let passed = 0, failed = 0;
console.log('\n========== queue e2e assertions ==========');
for (const a of assertions) {
  const mark = a.ok ? '✓' : '✗';
  console.log(`  ${mark} ${a.label}`);
  if (!a.ok && a.hint) console.log(`     ↳ ${a.hint}`);
  if (a.ok) passed++; else failed++;
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed}`);
if (failed > 0) {
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/ink-queue-e2e-frames.log', allFrames()));
  console.log('frames → /tmp/ink-queue-e2e-frames.log');
}
process.exit(failed === 0 ? 0 : 1);
