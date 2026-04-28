import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { collectLedger, renderLedgerPage } from '../ledger.js';

describe('collectLedger', () => {
  const root = join(tmpdir(), `dirgha-ledger-test-${randomUUID()}`);

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('missing dir → empty summary, no throw', async () => {
    const s = await collectLedger({ ledgerDir: join(root, 'never') });
    expect(s).toEqual({ scopes: [], totalEntries: 0, scopeCount: 0 });
  });

  it('parses one scope correctly', async () => {
    const dir = join(root, 'ledger');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'default.jsonl'), [
      JSON.stringify({ ts: '2026-04-26T10:00:00Z', kind: 'goal', text: 'ship 1.7.7' }),
      JSON.stringify({ ts: '2026-04-27T11:00:00Z', kind: 'decision', text: 'use verify-install gate' }),
      JSON.stringify({ ts: '2026-04-27T12:00:00Z', kind: 'observation', text: 'install fails on workspace ref' }),
      'malformed-line',
    ].join('\n'));
    const s = await collectLedger({ ledgerDir: dir });
    expect(s.scopeCount).toBe(1);
    expect(s.totalEntries).toBe(3);
    expect(s.scopes[0]?.scope).toBe('default');
    expect(s.scopes[0]?.byKind).toEqual({ goal: 1, decision: 1, observation: 1 });
    expect(s.scopes[0]?.recent[0]?.kind).toBe('observation'); // newest-first
  });

  it('skips empty scopes', async () => {
    const dir = join(root, 'ledger');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'empty.jsonl'), '');
    await writeFile(join(dir, 'real.jsonl'), JSON.stringify({ ts: '2026-04-27T10:00:00Z', kind: 'note', text: 'x' }));
    const s = await collectLedger({ ledgerDir: dir });
    expect(s.scopes.map(x => x.scope)).toEqual(['real']);
  });

  it('sorts scopes by latestTs descending', async () => {
    const dir = join(root, 'ledger');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'old.jsonl'), JSON.stringify({ ts: '2026-04-20T10:00:00Z', kind: 'note', text: 'old' }));
    await writeFile(join(dir, 'new.jsonl'), JSON.stringify({ ts: '2026-04-27T10:00:00Z', kind: 'note', text: 'new' }));
    const s = await collectLedger({ ledgerDir: dir });
    expect(s.scopes.map(x => x.scope)).toEqual(['new', 'old']);
  });

  it('attaches digest excerpt when <scope>.md exists', async () => {
    const dir = join(root, 'ledger');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'project.jsonl'), JSON.stringify({ ts: '2026-04-27T10:00:00Z', kind: 'note', text: 'x' }));
    await writeFile(join(dir, 'project.md'), '# Project\nKey learnings: blah\n');
    const s = await collectLedger({ ledgerDir: dir });
    expect(s.scopes[0]?.digestExcerpt).toContain('Project');
  });
});

describe('renderLedgerPage', () => {
  it('empty summary renders no-entries message', () => {
    const html = renderLedgerPage({ scopes: [], totalEntries: 0, scopeCount: 0 });
    expect(html).toContain('No ledger entries');
    expect(html).toContain('href="/cost"');
  });

  it('scope section + recent table + digest excerpt', () => {
    const html = renderLedgerPage({
      scopes: [{
        scope: 'default',
        entryCount: 2,
        byKind: { goal: 1, note: 1 },
        earliestTs: '2026-04-26T10:00:00Z',
        latestTs: '2026-04-27T10:00:00Z',
        recent: [
          { ts: '2026-04-27T10:00:00Z', kind: 'note', text: 'a recent note' },
          { ts: '2026-04-26T10:00:00Z', kind: 'goal', text: 'ship things' },
        ],
        digestExcerpt: '# Default scope digest',
      }],
      totalEntries: 2,
      scopeCount: 1,
    });
    expect(html).toContain('default');
    expect(html).toContain('a recent note');
    expect(html).toContain('Default scope digest');
    expect(html).toContain('goal×1');
  });

  it('escapes HTML in digest + entry text', () => {
    const html = renderLedgerPage({
      scopes: [{
        scope: 'evil',
        entryCount: 1,
        byKind: { note: 1 },
        latestTs: '2026-04-27T10:00:00Z',
        recent: [{ ts: '2026-04-27T10:00:00Z', kind: 'note', text: '<script>alert(1)</script>' }],
        digestExcerpt: '<img src=x onerror=alert(1)>',
      }],
      totalEntries: 1,
      scopeCount: 1,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });
});
