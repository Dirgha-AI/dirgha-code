import chalk from 'chalk';

export const KEYWORDS = new Set([
  'if','else','for','while','do','switch','case','break','continue',
  'function','const','let','var','class','return','import','export','from',
  'async','await','new','typeof','instanceof','void','delete','throw','try',
  'catch','finally','yield','static','extends','super','this','of',
  'def','and','or','not','in','is','None','True','False','pass','lambda',
  'with','as','raise','except','elif','global','nonlocal',
  'fn','mut','use','mod','pub','impl','struct','enum','trait','where','match',
  'type','interface','package','func','go','chan','map','select','defer',
  'true','false','null','undefined','nil',
]);

export interface Token { type: string; value: string; }

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, state: any = 'NORMAL', buf = '';
  const flush = (type: string) => { if (buf) { tokens.push({ type, value: buf }); buf = ''; } };

  while (i < code.length) {
    const ch = code[i], ahead = code.slice(i, i + 3);
    if (state === 'BLOCK_COMMENT') {
      buf += ch; if (ahead.startsWith('*/')) { buf += code[i + 1]; i += 2; flush('comment'); state = 'NORMAL'; } else i++;
      continue;
    }
    if (state === 'LINE_COMMENT') {
      if (ch === '\n') { flush('comment'); tokens.push({ type: 'other', value: '\n' }); state = 'NORMAL'; i++; } else { buf += ch; i++; }
      continue;
    }
    if (state === 'STRING_D' || state === 'STRING_S' || state === 'TEMPLATE') {
      buf += ch; i++;
      const end = state === 'STRING_D' ? '"' : state === 'STRING_S' ? "'" : '`';
      if (ch === '\\') { buf += code[i] ?? ''; i++; } else if (ch === end) { flush('string'); state = 'NORMAL'; }
      continue;
    }
    if (ahead.startsWith('/*')) { flush('other'); buf = '/*'; i += 2; state = 'BLOCK_COMMENT'; continue; }
    if ((ahead.startsWith('//') || ch === '#')) { flush('other'); buf = ch === '#' ? '#' : '//'; i += ch === '#' ? 1 : 2; state = 'LINE_COMMENT'; continue; }
    if (ch === '"') { flush('other'); buf = '"'; i++; state = 'STRING_D'; continue; }
    if (ch === "'") { flush('other'); buf = "'"; i++; state = 'STRING_S'; continue; }
    if (ch === '`') { flush('other'); buf = '`'; i++; state = 'TEMPLATE'; continue; }

    const op = ['=>', '===', '!==', '>=', '<=', '&&', '||', '??', '?.', '...'].find(o => code.startsWith(o, i));
    if (op) { flush('other'); tokens.push({ type: 'operator', value: op }); i += op.length; continue; }

    if (/[a-zA-Z_$]/.test(ch)) {
      flush('other'); let word = ''; while (i < code.length && /[\w$]/.test(code[i])) word += code[i++];
      if (code[i] === '(') tokens.push({ type: 'function', value: word });
      else if (KEYWORDS.has(word)) tokens.push({ type: 'keyword', value: word });
      else if (/^[A-Z]/.test(word)) tokens.push({ type: 'type', value: word });
      else tokens.push({ type: 'other', value: word });
      continue;
    }
    if (/[0-9]/.test(ch)) { flush('other'); let num = ''; while (i < code.length && /[0-9._xXa-f]/.test(code[i])) num += code[i++]; tokens.push({ type: 'number', value: num }); continue; }
    buf += ch; i++;
  }
  flush(state === 'LINE_COMMENT' ? 'comment' : state !== 'NORMAL' ? 'string' : 'other');
  return tokens;
}

export function applyColor(token: Token): string {
  const c: any = { keyword: '#569CD6', string: '#CE9178', comment: '#6A9955', number: '#B5CEA8', function: '#DCDCAA', type: '#4EC9B0' };
  const hex = c[token.type] || '#D4D4D4';
  return token.type === 'comment' ? chalk.hex(hex).italic(token.value) : chalk.hex(hex)(token.value);
}
