// scope: S19a

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { aggregateCost, renderCostPage, type CostAuditEntry } from './cost.js';

/**
 * Dirgha Web Dashboard — localhost-only HTTP server for audit events.
 *
 * Security model:
 * - Binds exclusively to localhost (127.0.0.1) by default; never exposes to external interfaces.
 * - Read-only: serves a static HTML dashboard with no write endpoints.
 * - No authentication: intended for local use by the machine's user.
 * - Audit data is read from ~/.dirgha/audit/events.jsonl; no modification.
 */

export interface AuditEntry {
  ts: string;
  kind: string;
  actor?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface StartWebServerOptions {
  port?: number;        // default 7878, override via DIRGHA_WEB_PORT
  host?: string;        // default 127.0.0.1 — never bind 0.0.0.0
  auditFile?: string;   // default ~/.dirgha/audit/events.jsonl — for test injection
}

export interface RunningWebServer {
  url: string;          // e.g. http://127.0.0.1:7878
  close(): Promise<void>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAuditPage(entries: AuditEntry[], opts?: { limit?: number }): string {
  const limit = opts?.limit;
  const data = limit ? entries.slice(0, limit) : entries;

  const rows = data.map(entry => {
    const ts = escapeHtml(entry.ts);
    const kind = escapeHtml(entry.kind);
    const actor = entry.actor ? escapeHtml(entry.actor) : '';
    const summaryRaw = entry.summary ? entry.summary.slice(0, 120) : '';
    const summary = escapeHtml(summaryRaw);
    return `<tr>
      <td class="ts">${ts}</td>
      <td class="kind">${kind}</td>
      <td>${actor}</td>
      <td class="summary">${summary}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dirgha Audit Dashboard</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: system-ui, sans-serif;
    background: #1e1e1e;
    color: #d4d4d4;
    margin: 0;
    padding: 1rem;
  }
  h1 { margin-top: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th, td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #333;
  }
  th { background: #252525; }
  td.ts, td.kind {
    font-family: monospace;
    white-space: nowrap;
  }
  td.summary {
    max-width: 40rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <h1>Dirgha Audit Events</h1>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Kind</th>
        <th>Actor</th>
        <th>Summary</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

export async function readAuditEntries(file: string, limit?: number): Promise<AuditEntry[]> {
  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const entries: AuditEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && 'ts' in parsed && 'kind' in parsed) {
        entries.push(parsed as AuditEntry);
      }
    } catch {
      // swallow malformed line
    }
  }

  entries.sort((a, b) => {
    const aTime = new Date(a.ts).getTime();
    const bTime = new Date(b.ts).getTime();
    return bTime - aTime; // newest first
  });

  if (limit !== undefined && limit > 0) {
    return entries.slice(0, limit);
  }
  return entries;
}

export async function startWebServer(opts?: StartWebServerOptions): Promise<RunningWebServer> {
  const host = (() => {
    const h = opts?.host ?? '127.0.0.1';
    if (h === '0.0.0.0') return '127.0.0.1';
    return h;
  })();

  const portFromEnv = process.env.DIRGHA_WEB_PORT ? parseInt(process.env.DIRGHA_WEB_PORT, 10) : undefined;
  const port = opts?.port ?? (isNaN(portFromEnv as number) ? 7878 : portFromEnv) ?? 7878;
  const resolvedPort = isNaN(port) ? 7878 : port;

  const auditFile = opts?.auditFile ?? path.join(os.homedir(), '.dirgha', 'audit', 'events.jsonl');

  const HTML_HEADERS = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  const server = createServer(async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }
    try {
      if (req.url === '/') {
        const entries = await readAuditEntries(auditFile, 100);
        res.writeHead(200, HTML_HEADERS);
        res.end(renderAuditPage(entries));
        return;
      }
      if (req.url === '/cost') {
        const entries = await readAuditEntries(auditFile);
        // CostAuditEntry is structurally compatible — just retype.
        const summary = aggregateCost(entries as CostAuditEntry[]);
        res.writeHead(200, HTML_HEADERS);
        res.end(renderCostPage(summary));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(resolvedPort, host, () => resolve());
    server.on('error', reject);
  });

  const addr = server.address();
  let url: string;
  if (typeof addr === 'string') {
    url = addr;
  } else if (addr) {
    url = `http://${addr.address}:${addr.port}`;
  } else {
    url = `http://${host}:${resolvedPort}`;
  }

  return {
    url,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    }),
  };
}