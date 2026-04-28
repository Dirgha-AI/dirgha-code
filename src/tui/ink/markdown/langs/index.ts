/**
 * Native syntax highlighter — language registry + generic tokenizer.
 *
 * Replaces the `lowlight` dependency that gemini-cli pulls in. We accept
 * less-than-perfect syntax fidelity in exchange for zero runtime deps.
 * Each language contributes a small declarative spec (keywords, types,
 * comment shape, string delimiters); the shared lexer below walks the
 * source classifying chunks. Coverage targets the languages users most
 * frequently see in agent output: ts/tsx/js/jsx/py/sh/bash/go/rust/json/
 * yaml/md/diff/sql/html/css/c/cpp/java/ruby/php/rb.
 *
 * Rough equivalence to lowlight's class names:
 *   keyword → hljs-keyword
 *   string  → hljs-string
 *   number  → hljs-number
 *   comment → hljs-comment
 *   type    → hljs-type / hljs-title
 *   builtin → hljs-built_in
 *   operator → hljs-operator
 *   tag     → hljs-name
 *   attr    → hljs-attr
 *   meta    → hljs-meta
 *   punct   → (default)
 *   addition / deletion → diff prefixes
 */

import type { Token, TokenKind, Tokenizer } from './types.js';
export type { Token, TokenKind, Tokenizer } from './types.js';

interface LangSpec {
  keywords: ReadonlySet<string>;
  types?: ReadonlySet<string>;
  builtins?: ReadonlySet<string>;
  /** Line-comment prefix(es). Order them so longer prefixes come first. */
  lineComment?: readonly string[];
  /** Block comment open + close. */
  blockComment?: readonly [string, string];
  /** Quote chars for string literals. */
  stringQuotes?: readonly string[];
  /** Backtick template strings (ts/js). */
  templateLiteral?: boolean;
  /** Operator chars (single-char-classified). */
  operatorChars?: string;
  /** Whether to treat capitalised identifiers as `type` tokens (TS/Java/Rust). */
  capitalIsType?: boolean;
  /** Whether identifiers prefixed with `@` are decorators/meta (Py/TS/Java). */
  atIsMeta?: boolean;
  /** Whether `#` starts a line comment outside string context (Py/Rb/Sh). */
  hashIsComment?: boolean;
}

const TS_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'debugger', 'declare', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof',
  'interface', 'is', 'keyof', 'let', 'namespace', 'new', 'null', 'of',
  'package', 'private', 'protected', 'public', 'readonly', 'require', 'return',
  'satisfies', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
]);

const TS_TYPES = new Set([
  'any', 'bigint', 'boolean', 'never', 'number', 'object', 'string', 'symbol',
  'unknown', 'Array', 'Map', 'Set', 'Promise', 'Record', 'Partial', 'Readonly',
  'Pick', 'Omit', 'Required', 'Awaited', 'ReturnType', 'Parameters',
]);

const TS_BUILTINS = new Set([
  'console', 'process', 'globalThis', 'JSON', 'Math', 'Date', 'Error',
  'RegExp', 'Object', 'Number', 'String', 'Boolean', 'Symbol',
]);

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'match', 'case',
]);

const PY_BUILTINS = new Set([
  'abs', 'all', 'any', 'bin', 'bool', 'bytes', 'callable', 'chr', 'dict',
  'dir', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'hasattr', 'hash', 'hex', 'id', 'input', 'int', 'isinstance',
  'issubclass', 'iter', 'len', 'list', 'map', 'max', 'min', 'next', 'object',
  'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed',
  'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum',
  'super', 'tuple', 'type', 'vars', 'zip', 'self', 'cls', '__init__', '__main__',
]);

const SH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'select', 'while',
  'until', 'do', 'done', 'in', 'function', 'time', 'coproc', 'return', 'exit',
  'break', 'continue', 'export', 'local', 'declare', 'readonly', 'unset',
  'shift', 'set', 'source',
]);

const SH_BUILTINS = new Set([
  'echo', 'printf', 'cd', 'pwd', 'ls', 'cat', 'mv', 'cp', 'rm', 'mkdir',
  'rmdir', 'touch', 'chmod', 'chown', 'grep', 'sed', 'awk', 'find', 'xargs',
  'head', 'tail', 'sort', 'uniq', 'wc', 'curl', 'wget', 'git', 'npm', 'node',
  'python', 'python3', 'pip', 'docker', 'kubectl', 'tmux',
]);

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var', 'true', 'false', 'nil', 'iota',
]);

const GO_TYPES = new Set([
  'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64',
  'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string', 'uint', 'uint8',
  'uint16', 'uint32', 'uint64', 'uintptr',
]);

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
  'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
  'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
  'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
  'where', 'while', 'box', 'do', 'final', 'macro', 'override', 'priv',
  'typeof', 'unsized', 'virtual', 'yield',
]);

const RUST_TYPES = new Set([
  'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16', 'u32', 'u64',
  'u128', 'usize', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec',
  'Option', 'Result', 'Box', 'Rc', 'Arc', 'HashMap', 'HashSet',
]);

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'null', 'is', 'in', 'like',
  'between', 'order', 'by', 'group', 'having', 'limit', 'offset', 'insert',
  'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop',
  'alter', 'add', 'column', 'primary', 'key', 'foreign', 'references',
  'unique', 'index', 'on', 'as', 'distinct', 'count', 'sum', 'avg', 'min',
  'max', 'case', 'when', 'then', 'else', 'end', 'union', 'all', 'inner',
  'left', 'right', 'outer', 'join', 'cross', 'with', 'as',
]);

const CSS_KEYWORDS = new Set([
  '@media', '@import', '@keyframes', '@font-face', '@supports', '@charset',
  '@namespace', '@page', '@layer', '@container',
]);

const SPECS: Record<string, LangSpec> = {
  ts: {
    keywords: TS_KEYWORDS,
    types: TS_TYPES,
    builtins: TS_BUILTINS,
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    stringQuotes: ['"', "'"],
    templateLiteral: true,
    operatorChars: '+-*/%=<>!&|^~?:',
    capitalIsType: true,
    atIsMeta: true,
  },
  js: {
    keywords: TS_KEYWORDS,
    builtins: TS_BUILTINS,
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    stringQuotes: ['"', "'"],
    templateLiteral: true,
    operatorChars: '+-*/%=<>!&|^~?:',
    atIsMeta: true,
  },
  py: {
    keywords: PY_KEYWORDS,
    builtins: PY_BUILTINS,
    stringQuotes: ['"', "'"],
    operatorChars: '+-*/%=<>!&|^~',
    capitalIsType: true,
    atIsMeta: true,
    hashIsComment: true,
  },
  sh: {
    keywords: SH_KEYWORDS,
    builtins: SH_BUILTINS,
    stringQuotes: ['"', "'"],
    operatorChars: '|&<>=',
    hashIsComment: true,
  },
  go: {
    keywords: GO_KEYWORDS,
    types: GO_TYPES,
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    stringQuotes: ['"', '`'],
    operatorChars: '+-*/%=<>!&|^~:',
  },
  rust: {
    keywords: RUST_KEYWORDS,
    types: RUST_TYPES,
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    stringQuotes: ['"'],
    operatorChars: '+-*/%=<>!&|^~?:',
    capitalIsType: true,
    atIsMeta: true,
  },
  json: {
    keywords: new Set(['true', 'false', 'null']),
    stringQuotes: ['"'],
    operatorChars: ':,',
  },
  yaml: {
    keywords: new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off']),
    stringQuotes: ['"', "'"],
    operatorChars: ':-',
    hashIsComment: true,
  },
  sql: {
    keywords: SQL_KEYWORDS,
    lineComment: ['--'],
    blockComment: ['/*', '*/'],
    stringQuotes: ["'"],
    operatorChars: '+-*/%=<>!',
  },
  css: {
    keywords: CSS_KEYWORDS,
    blockComment: ['/*', '*/'],
    stringQuotes: ['"', "'"],
    operatorChars: ':;,',
  },
};

// Aliases — so users can fence ```typescript or ```javascript etc.
const ALIASES: Record<string, string> = {
  typescript: 'ts',
  tsx: 'ts',
  javascript: 'js',
  jsx: 'js',
  python: 'py',
  python3: 'py',
  bash: 'sh',
  zsh: 'sh',
  shell: 'sh',
  console: 'sh',
  golang: 'go',
  rs: 'rust',
  yml: 'yaml',
  postgresql: 'sql',
  mysql: 'sql',
  scss: 'css',
  sass: 'css',
};

function resolveLang(lang: string | null | undefined): LangSpec | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  const resolved = ALIASES[key] ?? key;
  return SPECS[resolved] ?? null;
}

/** Diff has its own dedicated tokenizer because lines have meaning, not chars. */
function tokenizeDiff(src: string): Token[] {
  const out: Token[] = [];
  for (const line of src.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      out.push({ kind: 'addition', value: line + '\n' });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      out.push({ kind: 'deletion', value: line + '\n' });
    } else if (line.startsWith('@@')) {
      out.push({ kind: 'meta', value: line + '\n' });
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      out.push({ kind: 'meta', value: line + '\n' });
    } else if (line.startsWith('diff ') || line.startsWith('index ')) {
      out.push({ kind: 'comment', value: line + '\n' });
    } else {
      out.push({ kind: 'plain', value: line + '\n' });
    }
  }
  return out;
}

/** HTML/XML — angle-tag aware. */
function tokenizeHtml(src: string): Token[] {
  const out: Token[] = [];
  // Greedy split into tags / text.
  const re = /(<!--[\s\S]*?-->|<[^>]+>|[^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const chunk = m[0];
    if (chunk.startsWith('<!--')) {
      out.push({ kind: 'comment', value: chunk });
      continue;
    }
    if (chunk.startsWith('<')) {
      // Split into <, tagname, attr=, value, >
      const tagInner = chunk.slice(1, -1);
      out.push({ kind: 'punct', value: '<' });
      const tagM = tagInner.match(/^\/?([\w:-]+)/);
      if (tagM) {
        out.push({ kind: 'tag', value: tagM[0] });
        const rest = tagInner.slice(tagM[0].length);
        // Attrs.
        const attrRe = /\s+([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|\S+))?/g;
        let am: RegExpExecArray | null;
        let lastIdx = 0;
        while ((am = attrRe.exec(rest)) !== null) {
          if (am.index > lastIdx) out.push({ kind: 'plain', value: rest.slice(lastIdx, am.index) });
          out.push({ kind: 'plain', value: ' ' });
          out.push({ kind: 'attr', value: am[1] });
          if (am[2]) {
            out.push({ kind: 'punct', value: '=' });
            out.push({ kind: 'string', value: am[2] });
          }
          lastIdx = attrRe.lastIndex;
        }
        if (lastIdx < rest.length) out.push({ kind: 'plain', value: rest.slice(lastIdx) });
      } else {
        out.push({ kind: 'plain', value: tagInner });
      }
      out.push({ kind: 'punct', value: '>' });
    } else {
      out.push({ kind: 'plain', value: chunk });
    }
  }
  return out;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_CONT = /[A-Za-z0-9_$]/;
const NUMBER_RE = /^(?:0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/;

/** Generic single-pass lexer driven by LangSpec. */
function tokenizeGeneric(src: string, spec: LangSpec): Token[] {
  const out: Token[] = [];
  const len = src.length;
  let i = 0;
  let plainStart = 0;

  const flushPlain = (): void => {
    if (i > plainStart) {
      out.push({ kind: 'plain', value: src.slice(plainStart, i) });
    }
  };

  while (i < len) {
    const ch = src[i];

    // Whitespace — accumulate as plain.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // Line comment.
    if (spec.lineComment) {
      const lc = spec.lineComment.find(p => src.startsWith(p, i));
      if (lc) {
        flushPlain();
        const end = src.indexOf('\n', i);
        const stop = end === -1 ? len : end;
        out.push({ kind: 'comment', value: src.slice(i, stop) });
        i = stop;
        plainStart = i;
        continue;
      }
    }

    // Hash comment (Py/Sh/Yaml/Rb).
    if (spec.hashIsComment && ch === '#') {
      flushPlain();
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? len : end;
      out.push({ kind: 'comment', value: src.slice(i, stop) });
      i = stop;
      plainStart = i;
      continue;
    }

    // Block comment.
    if (spec.blockComment && src.startsWith(spec.blockComment[0], i)) {
      flushPlain();
      const end = src.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      const stop = end === -1 ? len : end + spec.blockComment[1].length;
      out.push({ kind: 'comment', value: src.slice(i, stop) });
      i = stop;
      plainStart = i;
      continue;
    }

    // Strings.
    if (spec.stringQuotes && spec.stringQuotes.includes(ch)) {
      flushPlain();
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j += 1;
          break;
        }
        if (src[j] === '\n' && quote !== '`') {
          break;
        }
        j += 1;
      }
      out.push({ kind: 'string', value: src.slice(i, j) });
      i = j;
      plainStart = i;
      continue;
    }

    // Template literal (` ... `).
    if (spec.templateLiteral && ch === '`') {
      flushPlain();
      let j = i + 1;
      while (j < len) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '`') {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push({ kind: 'string', value: src.slice(i, j) });
      i = j;
      plainStart = i;
      continue;
    }

    // Numbers.
    if (ch >= '0' && ch <= '9') {
      const m = src.slice(i).match(NUMBER_RE);
      if (m) {
        flushPlain();
        out.push({ kind: 'number', value: m[0] });
        i += m[0].length;
        plainStart = i;
        continue;
      }
    }

    // Identifiers — keyword/type/builtin/plain.
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < len && IDENT_CONT.test(src[j])) j += 1;
      const word = src.slice(i, j);
      flushPlain();
      let kind: TokenKind;
      if (spec.keywords.has(word)) kind = 'keyword';
      else if (spec.types?.has(word)) kind = 'type';
      else if (spec.builtins?.has(word)) kind = 'builtin';
      else if (spec.capitalIsType && /^[A-Z]/.test(word) && j < len && (src[j] === '<' || word.length > 1)) kind = 'type';
      else kind = 'plain';
      out.push({ kind, value: word });
      i = j;
      plainStart = i;
      continue;
    }

    // Decorator / meta (@foo).
    if (spec.atIsMeta && ch === '@' && i + 1 < len && IDENT_START.test(src[i + 1])) {
      flushPlain();
      let j = i + 1;
      while (j < len && IDENT_CONT.test(src[j])) j += 1;
      out.push({ kind: 'meta', value: src.slice(i, j) });
      i = j;
      plainStart = i;
      continue;
    }

    // Operators.
    if (spec.operatorChars && spec.operatorChars.includes(ch)) {
      flushPlain();
      let j = i;
      while (j < len && spec.operatorChars.includes(src[j])) j += 1;
      out.push({ kind: 'operator', value: src.slice(i, j) });
      i = j;
      plainStart = i;
      continue;
    }

    // Default — let it accumulate as plain.
    i += 1;
  }
  flushPlain();
  return out;
}

/** Public entry point. Returns a single plain-text token if the lang is unknown. */
export function tokenize(src: string, lang: string | null | undefined): Token[] {
  if (!lang) return [{ kind: 'plain', value: src }];

  const norm = lang.toLowerCase();
  const resolvedLang = ALIASES[norm] ?? norm;

  // Special cases.
  if (resolvedLang === 'diff' || resolvedLang === 'patch') {
    return tokenizeDiff(src);
  }
  if (resolvedLang === 'html' || resolvedLang === 'xml' || resolvedLang === 'svg') {
    return tokenizeHtml(src);
  }
  if (resolvedLang === 'md' || resolvedLang === 'markdown') {
    // Recursive markdown rendering would loop; show as plain.
    return [{ kind: 'plain', value: src }];
  }

  const spec = resolveLang(resolvedLang);
  if (!spec) return [{ kind: 'plain', value: src }];

  return tokenizeGeneric(src, spec);
}

export { resolveLang };
