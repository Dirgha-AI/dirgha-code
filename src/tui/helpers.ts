/** tui/helpers.ts — Pure helpers: markdown, history, editor, uid */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS } from './constants.js';

export { renderMd, MarkdownBuffer } from './markdown.js';
export { uid, loadHistory, saveHistory, hhmm } from './system.js';

export function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function modelLabel(id: string): string {
  const m = MODELS.find(x => x.id === id);
  return m ? m.label : id.split('/').pop() || id;
}

export function provLabel(provider: string): string {
  const map: Record<string, string> = {
    nvidia: 'NVIDIA', anthropic: 'Anthropic', openai: 'OpenAI',
    openrouter: 'OpenRouter', fireworks: 'Fireworks', together: 'Together',
    deepinfra: 'DeepInfra', ollama: 'Ollama', gateway: 'Gateway',
  };
  return map[provider?.toLowerCase()] ?? provider ?? 'Unknown';
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function openInEditor(content: string): string {
  const editor = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';
  const tmp = join(tmpdir(), `dirgha-edit-${Date.now()}.md`);
  try {
    writeFileSync(tmp, content, 'utf8');
    execFileSync(editor, [tmp], { stdio: 'inherit' });
    return readFileSync(tmp, 'utf8');
  } catch {
    return content;
  }
}
