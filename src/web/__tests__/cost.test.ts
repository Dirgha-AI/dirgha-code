import { describe, it, expect } from 'vitest';
import { aggregateCost, renderCostPage, type CostAuditEntry } from '../cost.js';

describe('aggregateCost', () => {
  it('sums tokens and turns per model from turn-end entries only', () => {
    const entries: CostAuditEntry[] = [
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 1000, outputTokens: 500 } },
      { ts: '2026-04-26T11:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 2000, outputTokens: 800 } },
      { ts: '2026-04-26T12:00:00Z', kind: 'tool',     model: 'claude-opus-4-7', usage: { inputTokens: 99999, outputTokens: 99999 } },
      { ts: '2026-04-26T13:00:00Z', kind: 'turn-end', model: 'tencent/hy3-preview:free', usage: { inputTokens: 5000, outputTokens: 1000 } },
    ];
    const s = aggregateCost(entries);
    expect(s.totalTurns).toBe(3);
    expect(s.modelCount).toBe(2);
    expect(s.totalInputTokens).toBe(8000);
    expect(s.totalOutputTokens).toBe(2300);
    const opus = s.totals.find(t => t.model === 'claude-opus-4-7');
    expect(opus?.turns).toBe(2);
    expect(opus?.inputTokens).toBe(3000);
  });

  it('zero cost for free models (no price entry)', () => {
    const s = aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'tencent/hy3-preview:free', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } },
    ]);
    expect(s.totalCostUsd).toBe(0);
    expect(s.totals[0]?.costUsd).toBe(0);
  });

  it('paid model fold uses inputPerM + outputPerM + cachedInputPerM', () => {
    const s = aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 1_000_000 } },
    ]);
    // The exact $ depends on prices.ts, but it MUST be > 0 for a paid model.
    expect(s.totalCostUsd).toBeGreaterThan(0);
  });

  it('window timestamps cover earliest + latest', () => {
    const s = aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 100 } },
      { ts: '2026-04-27T15:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 100 } },
      { ts: '2026-04-26T11:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 100 } },
    ]);
    expect(s.windowFromTs).toBe('2026-04-26T10:00:00Z');
    expect(s.windowToTs).toBe('2026-04-27T15:00:00Z');
  });

  it('totals sorted descending by cost', () => {
    const s = aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'tencent/hy3-preview:free', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } },
      { ts: '2026-04-26T11:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7',          usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } },
    ]);
    expect(s.totals[0]?.model).toBe('claude-opus-4-7');
    expect(s.totals[1]?.model).toBe('tencent/hy3-preview:free');
  });

  it('survives unknown bare model id (routeModel throws → cost = 0)', () => {
    const s = aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'definitely-not-a-real-model', usage: { inputTokens: 1_000_000 } },
    ]);
    expect(s.totalCostUsd).toBe(0);
    expect(s.totalTurns).toBe(1);
  });
});

describe('renderCostPage', () => {
  it('contains nav links + stat tiles + table rows', () => {
    const html = renderCostPage(aggregateCost([
      { ts: '2026-04-26T10:00:00Z', kind: 'turn-end', model: 'claude-opus-4-7', usage: { inputTokens: 1000, outputTokens: 500 } },
    ]));
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/cost"');
    expect(html).toContain('href="/ledger"');
    expect(html).toContain('Total Cost');
    expect(html).toContain('claude-opus-4-7');
    expect(html).toContain('<table');
  });

  it('escapes HTML in model names (no XSS)', () => {
    const html = renderCostPage({
      totals: [{ model: '<script>alert(1)</script>', inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, turns: 0 }],
      totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCachedTokens: 0,
      totalTurns: 0, modelCount: 1,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
