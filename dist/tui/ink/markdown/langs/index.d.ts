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
import type { Token } from './types.js';
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
declare function resolveLang(lang: string | null | undefined): LangSpec | null;
/** Public entry point. Returns a single plain-text token if the lang is unknown. */
export declare function tokenize(src: string, lang: string | null | undefined): Token[];
export { resolveLang };
