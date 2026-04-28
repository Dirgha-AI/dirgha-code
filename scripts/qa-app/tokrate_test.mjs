/**
 * StatusBar tok/s rate readout. Mounts the StatusBar component into
 * a fake stdout, drives it with `liveOutputTokens` + `liveDurationMs`,
 * and asserts the rate is rendered correctly:
 *
 *   - busy + non-zero output + ≥250 ms ⇒ "<n> tok/s" appears, in green
 *   - busy but duration < 250 ms ⇒ no readout (avoid divide-by-tiny noise)
 *   - busy but no output yet ⇒ no readout
 *   - not busy ⇒ no readout (status bar stays quiet between turns)
 *   - readout calculation matches Math.round(out / dur * 1000)
 */

import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as React from 'react';
import { render } from 'ink';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { StatusBar } = await import(_toUrl(_join(ROOT, 'tui/ink/components/StatusBar.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

class FakeStdout extends Writable {
  constructor() {
    super();
    this.frames = [];
    this.columns = 120;
    this.rows = 40;
    this.isTTY = true;
  }
  _write(chunk, _enc, cb) { this.frames.push(chunk.toString('utf8')); cb(); }
  cursorTo() {}
  clearLine() {}
  moveCursor() {}
  get everSeen() { return this.frames.join(''); }
}

function mount(props) {
  const fake = new FakeStdout();
  const fakeStderr = new FakeStdout();
  const inst = render(React.createElement(StatusBar, props), { stdout: fake, stderr: fakeStderr });
  return { fake, inst };
}

console.log('\n=== tokrate: streaming with measurable duration shows tok/s ===');
{
  const { fake, inst } = mount({
    model: 'mock', provider: 'p', inputTokens: 0, outputTokens: 0, costUsd: 0,
    cwd: '/tmp', busy: true, liveOutputTokens: 100, liveDurationMs: 1000,
  });
  await new Promise(r => setTimeout(r, 50));
  inst.unmount();
  // 100 tokens / 1000 ms × 1000 = 100 tok/s
  check('"100 tok/s" rendered',          /100 tok\/s/.test(fake.everSeen), JSON.stringify(fake.everSeen).slice(0, 200));
}

console.log('\n=== tokrate: short bursts (<250ms) suppress the readout ===');
{
  const { fake, inst } = mount({
    model: 'mock', provider: 'p', inputTokens: 0, outputTokens: 0, costUsd: 0,
    cwd: '/tmp', busy: true, liveOutputTokens: 100, liveDurationMs: 50,
  });
  await new Promise(r => setTimeout(r, 50));
  inst.unmount();
  check('no tok/s during sub-250ms warmup', !/tok\/s/.test(fake.everSeen));
}

console.log('\n=== tokrate: zero output suppresses the readout ===');
{
  const { fake, inst } = mount({
    model: 'mock', provider: 'p', inputTokens: 0, outputTokens: 0, costUsd: 0,
    cwd: '/tmp', busy: true, liveOutputTokens: 0, liveDurationMs: 1000,
  });
  await new Promise(r => setTimeout(r, 50));
  inst.unmount();
  check('no tok/s before first delta',   !/tok\/s/.test(fake.everSeen));
}

console.log('\n=== tokrate: idle (not busy) hides the readout ===');
{
  const { fake, inst } = mount({
    model: 'mock', provider: 'p', inputTokens: 0, outputTokens: 0, costUsd: 0,
    cwd: '/tmp', busy: false, liveOutputTokens: 100, liveDurationMs: 1000,
  });
  await new Promise(r => setTimeout(r, 50));
  inst.unmount();
  check('no tok/s when idle',            !/tok\/s/.test(fake.everSeen));
}

console.log('\n=== tokrate: arithmetic — 250 tokens / 500 ms = 500 tok/s ===');
{
  const { fake, inst } = mount({
    model: 'mock', provider: 'p', inputTokens: 0, outputTokens: 0, costUsd: 0,
    cwd: '/tmp', busy: true, liveOutputTokens: 250, liveDurationMs: 500,
  });
  await new Promise(r => setTimeout(r, 50));
  inst.unmount();
  check('rendered "500 tok/s"',           /500 tok\/s/.test(fake.everSeen));
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
