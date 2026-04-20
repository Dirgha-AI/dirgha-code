import { tokenize, applyColor } from './syntax-tokenizer.js';
import { highlightDiff, highlightSQL, highlightShell, highlightJSON } from './syntax-languages.js';

export function highlight(code: string, lang?: string): string {
  const l = lang?.toLowerCase() ?? '';
  if (l === 'diff' || l === 'patch') return highlightDiff(code);
  if (l === 'sql') return highlightSQL(code);
  if (l === 'sh' || l === 'bash' || l === 'shell' || l === 'zsh') return highlightShell(code);
  if (l === 'json' || l === 'jsonc') return highlightJSON(code);
  
  try {
    const tokens = tokenize(code);
    const colored = tokens.map(applyColor).join('');
    return colored.split('\n').map(line => '  ' + line).join('\n');
  } catch {
    return code.split('\n').map(l => '  ' + l).join('\n');
  }
}

export function renderMarkdownWithHighlight(md: string): string {
  return md.replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_match, lang, code) => {
    return '```' + lang + '\n' + highlight(code.replace(/\n$/, ''), lang || undefined) + '\n```';
  });
}
