/** tools/browser/legacy.ts — Fallback browser actions using curl/lightpanda */
import type { ToolResult } from '../../types.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { truncateOutput, MAX_OUTPUT } from './utils.js';

const FALLBACK_LP = '/opt/lightpanda/lightpanda';

function stripHtml(html: string): string {
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(div|p|h[1-6]|li|tr|br\s*\/?)[\s>]/gi, '\n<$1 ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function fetchHtml(url: string): string {
  if (existsSync(FALLBACK_LP)) {
    const r = spawnSync(FALLBACK_LP, ['fetch', '--dump', 'html', url], { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0 && r.stdout) return r.stdout;
  }
  const r = spawnSync('curl', ['-sL', '--max-time', '15', url], { encoding: 'utf8', timeout: 20000 });
  if (r.stdout) return r.stdout;
  throw new Error('Browser not available. Install agent-browser: npm install -g agent-browser');
}

export function navigateLegacy(url: string): ToolResult {
  const html = fetchHtml(url);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '(no title)';
  return { 
    tool: 'browser', 
    result: `⚠️ Fallback mode\n\nTitle: ${title}\n\n${stripHtml(html).slice(0, MAX_OUTPUT)}` 
  };
}

export function extractLegacy(url: string, selector: string): ToolResult {
  const html = fetchHtml(url);
  let items: string[] = [];
  
  if (selector === 'links') {
    const re = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m; while ((m = re.exec(html)) && items.length < 100) items.push(`${stripHtml(m[2]!)} → ${m[1]}`);
  } else if (selector === 'headings') {
    const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m; while ((m = re.exec(html)) && items.length < 80) items.push(`h${m[1]}: ${stripHtml(m[2]!)}`);
  } else {
    items.push(stripHtml(html).slice(0, MAX_OUTPUT));
  }
  
  return { tool: 'browser', result: `⚠️ Fallback\n\n${items.join('\n') || 'No content'}` };
}

export function searchLegacy(query: string): ToolResult {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = fetchHtml(url);
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const results: string[] = [];
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    results.push(`${results.length + 1}. ${stripHtml(m[2]!)}\n   ${m[1]!}\n   ${stripHtml(m[3]!)}`);
  }
  return { tool: 'browser', result: `⚠️ Fallback\n\n${results.join('\n\n') || 'No results'}` };
}
