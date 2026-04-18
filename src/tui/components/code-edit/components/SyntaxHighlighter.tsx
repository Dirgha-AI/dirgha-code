/**
 * SyntaxHighlighter.tsx — Lightweight regex-based syntax highlighting
 */

import React, { memo, useMemo } from 'react';
import { Text } from 'ink';
import { detectLanguage, LANGUAGE_PATTERNS } from '../patterns/index.js';
import { C } from '../../../colors.js';

interface SyntaxHighlighterProps {
  code: string;
  path?: string;
  maxLines?: number;
}

export const SyntaxHighlighter = memo(function SyntaxHighlighter({
  code,
  path,
  maxLines = 50,
}: SyntaxHighlighterProps) {
  const highlighted = useMemo(() => {
    const language = path ? detectLanguage(path) : 'text';
    const patterns = LANGUAGE_PATTERNS[language] || [];

    const lines = code.split('\n').slice(0, maxLines);

    return lines.map((line, i) => {
      if (!patterns.length) {
        return <Text key={i} color={C.textPrimary}>{line}</Text>;
      }

      let segments: Array<{ text: string; color: string }> = [{ text: line, color: C.textPrimary }];

      for (const { pattern, color } of patterns) {
        const newSegments: typeof segments = [];

        for (const segment of segments) {
          if (segment.color !== C.textPrimary) {
            newSegments.push(segment);
            continue;
          }

          const parts = segment.text.split(pattern);
          const matches = segment.text.match(pattern) || [];

          parts.forEach((part, idx) => {
            if (part) newSegments.push({ text: part, color: C.textPrimary });
            if (matches[idx]) newSegments.push({ text: matches[idx], color });
          });
        }

        segments = newSegments;
      }

      return (
        <Text key={i}>
          {segments.map((s, j) => (
            <Text key={j} color={s.color}>{s.text}</Text>
          ))}
        </Text>
      );
    });
  }, [code, path, maxLines]);

  return <>{highlighted}</>;
});

export default SyntaxHighlighter;
