/**
 * Pure functions for cost aggregation and HTML rendering for the cost dashboard.
 * These are testable and used by web/server.ts.
 */

// scope: S19b

import { routeModel } from '../providers/dispatch.js';
import { findPrice } from '../intelligence/prices.js';

export interface CostAuditEntry {
  ts: string;
  kind?: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number };
}

export interface ModelTotal {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  turns: number;
}

export interface CostSummary {
  totals: ModelTotal[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalTurns: number;
  modelCount: number;
  windowFromTs?: string;
  windowToTs?: string;
}

export function aggregateCost(entries: CostAuditEntry[]): CostSummary {
  const modelMap = new Map<string, ModelTotal>();
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalTurns = 0;
  let windowFromTs: string | undefined;
  let windowToTs: string | undefined;

  for (const entry of entries) {
    if (entry.kind !== 'turn-end') {
      continue;
    }
    totalTurns++;

    if (entry.ts) {
      if (!windowFromTs || entry.ts < windowFromTs) windowFromTs = entry.ts;
      if (!windowToTs || entry.ts > windowToTs) windowToTs = entry.ts;
    }

    const usage = entry.usage ?? {};
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const cachedTokens = usage.cachedTokens ?? 0;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCachedTokens += cachedTokens;

    // Aggregate by the original model id; routeModel resolves the provider
    // for the price lookup. Same fold-formula as src/cli/subcommands/cost.ts.
    const modelKey = entry.model ?? 'unknown';
    let costUsd = 0;
    if (modelKey !== 'unknown') {
      try {
        const provider = routeModel(modelKey);
        const price = findPrice(provider, modelKey);
        if (price) {
          costUsd = (inputTokens  / 1_000_000) * price.inputPerM
                  + (outputTokens / 1_000_000) * price.outputPerM
                  + (cachedTokens / 1_000_000) * (price.cachedInputPerM ?? 0);
        }
      } catch {
        // routeModel throws on bare unknown ids; treat as zero cost
      }
    }
    totalCostUsd += costUsd;

    // Update per‑model aggregate
    let modelTotal = modelMap.get(modelKey);
    if (!modelTotal) {
      modelTotal = {
        model: modelKey,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        turns: 0,
      };
      modelMap.set(modelKey, modelTotal);
    }
    modelTotal.inputTokens += inputTokens;
    modelTotal.outputTokens += outputTokens;
    modelTotal.cachedTokens += cachedTokens;
    modelTotal.costUsd += costUsd;
    modelTotal.turns += 1;
  }

  const totals = Array.from(modelMap.values()).sort((a, b) => b.costUsd - a.costUsd);

  return {
    totals,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalTurns,
    modelCount: totals.length,
    windowFromTs,
    windowToTs,
  };
}

export function renderCostPage(summary: CostSummary): string {
  const esc = (s: string | number): string => {
    const str = String(s);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  };

  const formatNum = (n: number): string => n.toLocaleString('en-US');

  const formatCost = (cost: number): string => '$' + cost.toFixed(4);

  const title = `Dirgha Cost — last ${summary.totalTurns} turns`;
  const nav = `<a href="/">Audit</a> | <a href="/cost">Cost</a> | <a href="/ledger">Ledger</a>`;

  // Stat tiles
  const statsHtml = `
    <div class="stats">
      <div class="stat-tile">
        <div class="stat-label">Total Cost</div>
        <div class="stat-value">${esc(formatCost(summary.totalCostUsd))}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Input Tokens</div>
        <div class="stat-value">${esc(formatNum(summary.totalInputTokens))}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Output Tokens</div>
        <div class="stat-value">${esc(formatNum(summary.totalOutputTokens))}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Total Turns</div>
        <div class="stat-value">${esc(formatNum(summary.totalTurns))}</div>
      </div>
    </div>
  `;

  // Table rows
  const rows = summary.totals.map(mt => `
      <tr>
        <td>${esc(mt.model)}</td>
        <td class="num">${esc(formatNum(mt.turns))}</td>
        <td class="num">${esc(formatNum(mt.inputTokens))}</td>
        <td class="num">${esc(formatNum(mt.outputTokens))}</td>
        <td class="num">${esc(formatNum(mt.cachedTokens))}</td>
        <td class="num">${esc(formatCost(mt.costUsd))}</td>
      </tr>
    `).join('');

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th class="num">Turns</th>
          <th class="num">In tokens</th>
          <th class="num">Out tokens</th>
          <th class="num">Cached tokens</th>
          <th class="num">Cost USD</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    body {
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 20px;
    }
    a { color: #66ccff; }
    h1 { margin-top: 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-tile {
      background: #252526;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .stat-label {
      font-size: 0.9em;
      opacity: 0.8;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 1.5em;
      font-weight: bold;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 16px;
    }
    th, td {
      padding: 8px 12px;
      border-bottom: 1px solid #333;
      text-align: left;
    }
    th.num, td.num {
      text-align: right;
    }
    thead th {
      background: #252526;
    }
    tbody tr:hover {
      background: #2a2d2e;
    }
    nav { margin-bottom: 20px; }
  </style>
</head>
<body>
  <nav>${nav}</nav>
  <h1>${esc(title)}</h1>
  ${statsHtml}
  ${tableHtml}
</body>
</html>`;
}