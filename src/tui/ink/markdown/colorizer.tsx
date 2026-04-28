/**
 * Code-fence colorizer.
 *
 * Tokenizes a code block via the native lexer (`./langs/`) and renders
 * the tokens with `<Text color={...}>` per kind. No alternate buffer,
 * no scroll viewer — that's a future enhancement. We just emit one
 * line per source line, padded with a left gutter so the code visually
 * separates from surrounding markdown text.
 *
 * Token-kind → palette mapping is centralised in `colorFor()` so theme
 * swaps work without touching this file.
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { Palette } from '../../theme.js';
import { tokenize, type Token, type TokenKind } from './langs/index.js';

interface ColorizerProps {
  code: string;
  lang: string | null;
  palette: Palette;
  /** Render line numbers in a left gutter. */
  showLineNumbers?: boolean;
  /** Cap visible lines (older content trimmed from top). */
  maxLines?: number;
}

export function CodeColorizer(props: ColorizerProps): React.ReactElement {
  const { code, lang, palette, showLineNumbers = false, maxLines } = props;

  const tokens = tokenize(code, lang);
  const lines = tokensToLines(tokens);
  const visible = maxLines !== undefined && lines.length > maxLines
    ? lines.slice(lines.length - maxLines)
    : lines;
  const startLine = lines.length - visible.length + 1;
  const gutterWidth = String(lines.length).length;

  return (
    <Box flexDirection="column">
      {visible.map((lineToks, idx) => (
        <Box key={idx} flexDirection="row">
          {showLineNumbers && (
            <Text color={palette.text.secondary} dimColor>
              {String(startLine + idx).padStart(gutterWidth, ' ')}
              {'  '}
            </Text>
          )}
          <Text>
            {lineToks.length === 0 ? (
              <Text>{' '}</Text>
            ) : (
              lineToks.map((tok, i) => (
                <Text key={i} color={colorFor(tok.kind, palette)}>
                  {tok.value}
                </Text>
              ))
            )}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** Split a flat token stream into per-line arrays so each line can render independently. */
function tokensToLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const tok of tokens) {
    if (!tok.value) continue;
    const parts = tok.value.split('\n');
    for (let p = 0; p < parts.length; p += 1) {
      const piece = parts[p];
      if (piece.length > 0) {
        lines[lines.length - 1].push({ kind: tok.kind, value: piece });
      }
      if (p < parts.length - 1) {
        lines.push([]);
      }
    }
  }
  // If the source ended with a newline we'll have a trailing empty line; drop it.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

function colorFor(kind: TokenKind, palette: Palette): string {
  switch (kind) {
    case 'keyword':  return palette.text.accent;          // purple-ish per theme
    case 'string':   return palette.status.success;       // green-ish
    case 'number':   return palette.text.link;            // blue-ish
    case 'comment':  return palette.ui.comment;           // muted
    case 'type':     return palette.status.warning;       // yellow-ish
    case 'builtin':  return palette.text.accent;
    case 'operator': return palette.text.secondary;
    case 'attr':     return palette.status.warning;
    case 'tag':      return palette.text.link;
    case 'meta':     return palette.text.accent;
    case 'addition': return palette.status.success;
    case 'deletion': return palette.status.error;
    case 'punct':    return palette.text.primary;
    case 'plain':
    default:         return palette.text.primary;
  }
}
