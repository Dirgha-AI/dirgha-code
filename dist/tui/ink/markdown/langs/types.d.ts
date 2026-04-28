/**
 * Language token type — what a tokenizer emits per chunk.
 *
 * The renderer maps each kind to a palette colour:
 *   keyword → text.accent (purple-ish per theme)
 *   string  → status.success (green-ish)
 *   number  → text.link (blue-ish)
 *   comment → ui.comment (muted)
 *   type    → status.warning (yellow-ish)
 *   builtin → text.accent
 *   operator → text.secondary
 *   punct   → text.primary (default)
 *   plain   → text.primary
 */
export type TokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'type' | 'builtin' | 'operator' | 'punct' | 'plain' | 'attr' | 'tag' | 'meta' | 'addition' | 'deletion';
export interface Token {
    kind: TokenKind;
    value: string;
}
export type Tokenizer = (src: string) => Token[];
