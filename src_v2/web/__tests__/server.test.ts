import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderAuditPage, readAuditEntries, startWebServer } from '../server.js';

describe('renderAuditPage', () => {
  it('renders a table with the supplied entries', () => {
    const html = renderAuditPage([
      { ts: '2026-04-27T17:00:00Z', kind: 'turn-end', actor: 'sess-1', summary: 'Hello' },
      { ts: '2026-04-27T16:00:00Z', kind: 'tool', summary: 'fs_read OK' },
    ]);
    expect(html).toContain('<title>Dirgha Audit Dashboard</title>');
    expect(html).toContain('<table');
    expect(html).toContain('turn-end');
    expect(html).toContain('fs_read OK');
    expect(html).toContain('sess-1');
  });

  it('escapes HTML in every cell (no XSS)', () => {
    const html = renderAuditPage([{
      ts: '2026-04-27T17:00:00Z',
      kind: '<script>alert(1)</script>',
      actor: 'a"b',
      summary: 'a&b<c',
    }]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&quot;b');
    expect(html).toContain('a&amp;b&lt;c');
  });

  it('truncates summary to 120 chars', () => {
    const long = 'x'.repeat(200);
    const html = renderAuditPage([{ ts: '2026-04-27T17:00:00Z', kind: 'k', summary: long }]);
    expect(html).toContain('x'.repeat(120));
    expect(html).not.toContain('x'.repeat(121));
  });
});

describe('readAuditEntries', () => {
  const dir = join(tmpdir(), `dirgha-web-test-${randomUUID()}`);
  const file = join(dir, 'events.jsonl');

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns [] for missing file', async () => {
    const entries = await readAuditEntries(join(dir, 'never-exists.jsonl'));
    expect(entries).toEqual([]);
  });

  it('parses JSONL, skips malformed, sorts newest-first', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(file, [
      JSON.stringify({ ts: '2026-04-26T10:00:00Z', kind: 'old' }),
      'not-json',
      JSON.stringify({ ts: '2026-04-27T10:00:00Z', kind: 'new' }),
      '',
      JSON.stringify({ no: 'ts-or-kind' }), // missing required fields
    ].join('\n'));
    const entries = await readAuditEntries(file);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe('new');
    expect(entries[1]?.kind).toBe('old');
  });

  it('respects limit', async () => {
    await mkdir(dir, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(JSON.stringify({ ts: `2026-04-27T10:0${i}:00Z`, kind: `k${i}` }));
    }
    await writeFile(file, lines.join('\n'));
    const entries = await readAuditEntries(file, 3);
    expect(entries).toHaveLength(3);
  });
});

describe('startWebServer', () => {
  it('binds localhost, serves /, 404s elsewhere, closes clean', async () => {
    const srv = await startWebServer({ port: 0, auditFile: '/nope' });
    const res = await fetch(srv.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const r404 = await fetch(srv.url + '/anything');
    expect(r404.status).toBe(404);

    await srv.close();
  });

  it('rewrites 0.0.0.0 host to 127.0.0.1 (security)', async () => {
    const srv = await startWebServer({ port: 0, host: '0.0.0.0', auditFile: '/nope' });
    expect(srv.url).toContain('127.0.0.1');
    await srv.close();
  });
});
