/**
 * Inline markdown renderer.
 *
 * Parses a single line of markdown into styled segments and renders them
 * with ink's native <Text> props (bold/italic/underline/strikethrough/
 * color/backgroundColor) — no ANSI-string intermediate. Handles:
 *
 *   **bold**            *italic*    _italic_       ~~strike~~
 *   `inline code`       <u>under</u>
 *   [link text](url)    https://bare-urls.example
 *   ***bold-italic***
 *
 * Adapted from gemini-cli/packages/cli/src/ui/utils/markdownParsingUtils.ts
 * + InlineMarkdownRenderer.tsx (Apache-2.0). The parsing regex is preserved
 * verbatim; the renderer is dirgha-native (ink JSX rather than chalk ANSI).
 */

import * as React from 'react';
import { Text } from 'ink';
import type { Palette } from '../../theme.js';

const BOLD_LEN = 2;
const ITALIC_LEN = 1;
const STRIKE_LEN = 2;
const CODE_LEN = 1;
const U_OPEN_LEN = 3;   // <u>
const U_CLOSE_LEN = 4;  // </u>

// Same alternation as gemini's parser. Order matters: ***foo*** must match
// before **foo** before *foo* / _foo_ / ~~foo~~ / [text](url) / `code` /
// <u>...</u> / bare URLs.
const INLINE_REGEX =
  /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;

interface InlineProps {
  text: string;
  palette: Palette;
  /** Override the base text colour. Defaults to palette.text.primary. */
  baseColor?: string;
  /** Used internally for nested calls so React keys stay unique. */
  keyPrefix?: string;
}

/** Render one or more lines of markdown text with inline emphasis. */
export function RenderInline(props: InlineProps): React.ReactElement {
  const { text, palette, baseColor, keyPrefix = 'i' } = props;
  const fg = baseColor ?? palette.text.primary;

  // Fast path — no markdown markers anywhere.
  if (!/[*_~`<[]|https?:/.test(text)) {
    return <Text color={fg}>{text}</Text>;
  }

  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let segIdx = 0;

  // Reset regex state on each call (regex is module-level for perf, but
  // RegExp.prototype.lastIndex persists across invocations).
  INLINE_REGEX.lastIndex = 0;

  while ((match = INLINE_REGEX.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const plain = text.slice(lastIdx, match.index);
      out.push(
        <Text key={`${keyPrefix}-${segIdx++}`} color={fg}>
          {plain}
        </Text>,
      );
    }

    const full = match[0];
    const node = renderSegment(full, palette, fg, `${keyPrefix}-${segIdx}`, text, match.index, INLINE_REGEX.lastIndex);
    out.push(node);
    segIdx += 1;

    lastIdx = INLINE_REGEX.lastIndex;
  }

  if (lastIdx < text.length) {
    out.push(
      <Text key={`${keyPrefix}-${segIdx}`} color={fg}>
        {text.slice(lastIdx)}
      </Text>,
    );
  }

  return <Text>{out}</Text>;
}

function renderSegment(
  full: string,
  palette: Palette,
  fg: string,
  key: string,
  /** Source text, used for italic boundary heuristics. */
  src: string,
  matchStart: number,
  matchEnd: number,
): React.ReactNode {
  // ***bold-italic***
  if (
    full.startsWith('***') &&
    full.endsWith('***') &&
    full.length > (BOLD_LEN + ITALIC_LEN) * 2
  ) {
    const inner = full.slice(BOLD_LEN + ITALIC_LEN, -BOLD_LEN - ITALIC_LEN);
    return (
      <Text key={key} bold italic>
        <RenderInline text={inner} palette={palette} baseColor={fg} keyPrefix={`${key}b`} />
      </Text>
    );
  }

  // **bold**
  if (full.startsWith('**') && full.endsWith('**') && full.length > BOLD_LEN * 2) {
    const inner = full.slice(BOLD_LEN, -BOLD_LEN);
    return (
      <Text key={key} bold>
        <RenderInline text={inner} palette={palette} baseColor={fg} keyPrefix={`${key}b`} />
      </Text>
    );
  }

  // *italic* / _italic_  — boundary heuristic from gemini: don't match if
  // adjacent to word chars, and don't match path-like patterns.
  if (
    full.length > ITALIC_LEN * 2 &&
    ((full.startsWith('*') && full.endsWith('*')) ||
      (full.startsWith('_') && full.endsWith('_'))) &&
    !/\w/.test(src.substring(matchStart - 1, matchStart)) &&
    !/\w/.test(src.substring(matchEnd, matchEnd + 1)) &&
    !/\S[./\\]/.test(src.substring(matchStart - 2, matchStart)) &&
    !/[./\\]\S/.test(src.substring(matchEnd, matchEnd + 2))
  ) {
    const inner = full.slice(ITALIC_LEN, -ITALIC_LEN);
    return (
      <Text key={key} italic>
        <RenderInline text={inner} palette={palette} baseColor={fg} keyPrefix={`${key}i`} />
      </Text>
    );
  }

  // ~~strikethrough~~
  if (full.startsWith('~~') && full.endsWith('~~') && full.length > STRIKE_LEN * 2) {
    const inner = full.slice(STRIKE_LEN, -STRIKE_LEN);
    return (
      <Text key={key} strikethrough>
        <RenderInline text={inner} palette={palette} baseColor={fg} keyPrefix={`${key}s`} />
      </Text>
    );
  }

  // `inline code` — supports n-tick fences (`` x ``) by matching a balanced run.
  if (full.startsWith('`') && full.endsWith('`') && full.length > CODE_LEN) {
    const m = full.match(/^(`+)(.+?)\1$/s);
    if (m && m[2]) {
      return (
        <Text key={key} color={palette.text.accent}>
          {m[2]}
        </Text>
      );
    }
  }

  // [text](url)
  if (full.startsWith('[') && full.includes('](') && full.endsWith(')')) {
    const m = full.match(/\[(.*?)\]\((.*?)\)/);
    if (m) {
      const [, linkText, url] = m;
      return (
        <Text key={key}>
          <RenderInline text={linkText} palette={palette} baseColor={fg} keyPrefix={`${key}l`} />
          <Text color={fg}> (</Text>
          <Text color={palette.text.link} underline>
            {url}
          </Text>
          <Text color={fg}>)</Text>
        </Text>
      );
    }
  }

  // <u>underline</u>
  if (
    full.startsWith('<u>') &&
    full.endsWith('</u>') &&
    full.length > U_OPEN_LEN + U_CLOSE_LEN - 1
  ) {
    const inner = full.slice(U_OPEN_LEN, -U_CLOSE_LEN);
    return (
      <Text key={key} underline>
        <RenderInline text={inner} palette={palette} baseColor={fg} keyPrefix={`${key}u`} />
      </Text>
    );
  }

  // bare URL
  if (/^https?:\/\//.test(full)) {
    return (
      <Text key={key} color={palette.text.link} underline>
        {full}
      </Text>
    );
  }

  // Fallback — render raw.
  return (
    <Text key={key} color={fg}>
      {full}
    </Text>
  );
}
