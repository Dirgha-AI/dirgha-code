import chalk from 'chalk';

const KEYWORDS = new Set([
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

type State = 'NORMAL' | 'STRING_D' | 'STRING_S' | 'TEMPLATE' | 'LINE_COMMENT' | 'BLOCK_COMMENT';

interface Token { type: string; value: string; }

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let state: State = 'NORMAL';
  let buf = '';

  const flush = (type: string) => { if (buf) { tokens.push({ type, value: buf }); buf = ''; } };

  while (i < code.length) {
    const ch = code[i];
    const ahead = code.slice(i, i + 3);

    if (state === 'BLOCK_COMMENT') {
      buf += ch;
      if (ahead.startsWith('*/')) { buf += code[i + 1]; i += 2; flush('comment'); state = 'NORMAL'; } else i++;
      continue;
    }
    if (state === 'LINE_COMMENT') {
      if (ch === '\n') { flush('comment'); tokens.push({ type: 'other', value: '\n' }); state = 'NORMAL'; i++; }
      else { buf += ch; i++; }
      continue;
    }
    if (state === 'STRING_D') {
      buf += ch; i++;
      if (ch === '\\') { buf += code[i] ?? ''; i++; }
      else if (ch === '"') { flush('string'); state = 'NORMAL'; }
      continue;
    }
    if (state === 'STRING_S') {
      buf += ch; i++;
      if (ch === '\\') { buf += code[i] ?? ''; i++; }
      else if (ch === "'") { flush('string'); state = 'NORMAL'; }
      continue;
    }
    if (state === 'TEMPLATE') {
      buf += ch; i++;
      if (ch === '\\') { buf += code[i] ?? ''; i++; }
      else if (ch === '`') { flush('string'); state = 'NORMAL'; }
      continue;
    }

    // NORMAL
    if (ahead.startsWith('/*')) { flush('other'); buf = '/*'; i += 2; state = 'BLOCK_COMMENT'; continue; }
    if ((ahead.startsWith('//') || ch === '#') && state === 'NORMAL') {
      flush('other'); buf = ch === '#' ? '#' : '//'; i += ch === '#' ? 1 : 2; state = 'LINE_COMMENT'; continue;
    }
    if (ch === '"') { flush('other'); buf = '"'; i++; state = 'STRING_D'; continue; }
    if (ch === "'") { flush('other'); buf = "'"; i++; state = 'STRING_S'; continue; }
    if (ch === '`') { flush('other'); buf = '`'; i++; state = 'TEMPLATE'; continue; }

    // multi-char operators
    const ops = ['=>', '===', '!==', '>=', '<=', '&&', '||', '??', '?.', '...'];
    const op = ops.find(o => code.startsWith(o, i));
    if (op) { flush('other'); tokens.push({ type: 'operator', value: op }); i += op.length; continue; }

    // word
    if (/[a-zA-Z_$]/.test(ch)) {
      flush('other');
      let word = '';
      while (i < code.length && /[\w$]/.test(code[i])) word += code[i++];
      // peek: function call?
      const next = code[i];
      if (next === '(') tokens.push({ type: 'function', value: word });
      else if (KEYWORDS.has(word)) tokens.push({ type: 'keyword', value: word });
      else if (/^[A-Z]/.test(word)) tokens.push({ type: 'type', value: word });
      else tokens.push({ type: 'other', value: word });
      continue;
    }

    // number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      flush('other');
      let num = '';
      while (i < code.length && /[0-9._xXa-fA-FbBoO]/.test(code[i])) num += code[i++];
      tokens.push({ type: 'number', value: num });
      continue;
    }

    buf += ch; i++;
  }
  flush(state === 'LINE_COMMENT' ? 'comment' : state !== 'NORMAL' ? 'string' : 'other');
  return tokens;
}

function applyColor(token: Token): string {
  switch (token.type) {
    case 'keyword':  return chalk.hex('#569CD6')(token.value);
    case 'string':   return chalk.hex('#CE9178')(token.value);
    case 'comment':  return chalk.hex('#6A9955').italic(token.value);
    case 'number':   return chalk.hex('#B5CEA8')(token.value);
    case 'function': return chalk.hex('#DCDCAA')(token.value);
    case 'type':     return chalk.hex('#4EC9B0')(token.value);
    case 'operator': return chalk.hex('#D4D4D4')(token.value);
    default:         return chalk.hex('#D4D4D4')(token.value);
  }
}

/** Diff-specific highlighter: +/- lines, @@ hunks, headers */
function highlightDiff(code: string): string {
  return code.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) return chalk.hex('#9CA3AF')(line);
    if (line.startsWith('@@'))  return chalk.hex('#38BDF8').bold(line);
    if (line.startsWith('+'))   return chalk.hex('#4ADE80')(line);
    if (line.startsWith('-'))   return chalk.hex('#F87171')(line);
    return chalk.hex('#D4D4D4')(line);
  }).map(l => '  ' + l).join('\n');
}

export function highlight(code: string, lang?: string): string {
  if (lang === 'diff' || lang === 'patch') return highlightDiff(code);
  try {
    const tokens = tokenize(code);
    const colored = tokens.map(applyColor).join('');
    return colored.split('\n').map(line => '  ' + line).join('\n');
  } catch {
    return code.split('\n').map(l => '  ' + l).join('\n');
  }
}

export function renderMarkdownWithHighlight(md: string): string {
  return md.replace(
    /^```(\w*)\n([\s\S]*?)^```/gm,
    (_match, lang: string, code: string) => {
      const highlighted = highlight(code.replace(/\n$/, ''), lang || undefined);
      return '```' + lang + '\n' + highlighted + '\n```';
    }
  );
}
