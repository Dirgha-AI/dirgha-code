import { marked } from 'marked';
// @ts-ignore
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import { highlight } from './syntax.js';

marked.use(markedTerminal({ reflowText: false, tab: 2, code: (s: string) => s }));

export function renderMd(text: string): string {
  try {
    return String(marked(text)).trimEnd();
  } catch { return text; }
}

export class MarkdownBuffer {
  private buf = '';
  push(chunk: string): string {
    this.buf += chunk;
    if (this.buf.length > 5000) return this.forceFlush();
    return '';
  }
  forceFlush(): string {
    const out = this.buf;
    this.buf = '';
    return out;
  }
}
