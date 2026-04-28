/**
 * Dropdown shown below the InputBox while the user is typing a
 * `/<command>` slash. Matches the built-in slash command list by
 * prefix first (most intuitive when the user types `/he` and expects
 * `/help`), then falls back to subsequence fuzzy match for typos.
 *
 * Contract with App/InputBox:
 *   - Parent renders this component when `query !== null`.
 *   - "query" is the substring after the leading `/` — empty string
 *     when the user has just typed `/` and nothing else (we show the
 *     full list in that case, like a command palette).
 *   - Parent calls `onPick(name)` with the bare command name (no
 *     leading slash) to splice the chosen command back into the input.
 *   - Parent calls `onCancel()` on Esc.
 *
 * Mirrors the structure of AtFileComplete — keyboard map (↑↓ tab/enter
 * esc), bordered Box, accent colour for selection.
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';

export interface SlashCommandEntry {
  name: string;
  description: string;
  aliases?: string[];
}

export interface SlashCompleteProps {
  commands: SlashCommandEntry[];
  query: string;
  onPick: (name: string) => void;
  onCancel: () => void;
}

const MAX_MATCHES = 10;

interface Scored {
  name: string;
  description: string;
  score: number;
}

function rankCommand(entry: SlashCommandEntry, query: string): { ok: boolean; score: number } {
  if (query === '') return { ok: true, score: 0 };
  const q = query.toLowerCase();
  const candidates: string[] = [entry.name.toLowerCase(), ...(entry.aliases ?? []).map(a => a.toLowerCase())];

  // Prefix match wins (highest score).
  let best = -Infinity;
  let matched = false;
  for (const c of candidates) {
    if (c.startsWith(q)) {
      matched = true;
      // Closer-length-to-query → tighter prefix match → higher score.
      best = Math.max(best, 1000 - (c.length - q.length));
    }
  }
  if (matched) return { ok: true, score: best };

  // Fall back to subsequence fuzzy on the canonical name.
  const p = entry.name.toLowerCase();
  let pi = 0;
  let firstHit = -1;
  let lastHit = -1;
  let score = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const target = q[qi];
    while (pi < p.length && p[pi] !== target) pi += 1;
    if (pi >= p.length) return { ok: false, score: 0 };
    if (firstHit === -1) firstHit = pi;
    if (lastHit !== -1) score -= pi - lastHit - 1;
    lastHit = pi;
    pi += 1;
  }
  score -= firstHit;
  return { ok: true, score };
}

export function SlashComplete(props: SlashCompleteProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 2, 70);

  const [cursor, setCursor] = React.useState(0);

  const matches: Scored[] = React.useMemo(() => {
    const scored: Scored[] = [];
    for (const cmd of props.commands) {
      const r = rankCommand(cmd, props.query);
      if (r.ok) scored.push({ name: cmd.name, description: cmd.description, score: r.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_MATCHES);
  }, [props.commands, props.query]);

  React.useEffect(() => {
    setCursor(c => Math.max(0, Math.min(c, matches.length - 1)));
  }, [matches.length]);

  useInput((_ch, key) => {
    if (key.escape) { props.onCancel(); return; }
    if (key.upArrow) { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(matches.length - 1, c + 1)); return; }
    if (key.tab || key.return) {
      const pick = matches[cursor];
      if (pick) props.onPick(pick.name);
    }
  });

  if (matches.length === 0) {
    return (
      <Box borderStyle="single" borderColor={palette.borderIdle} paddingX={1} width={width}>
        <Text color={palette.textMuted} dimColor>no slash commands match /{props.query}</Text>
      </Box>
    );
  }

  // Calculate name column width so descriptions line up.
  const nameWidth = Math.max(...matches.map(m => m.name.length)) + 1;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={palette.accent} paddingX={1} width={width}>
      <Box justifyContent="space-between">
        <Text color={palette.accent} bold>/{props.query}</Text>
        <Text color={palette.textMuted} dimColor>↑↓ · tab/enter · esc</Text>
      </Box>
      {matches.map((m, i) => (
        <Box key={m.name} gap={1} paddingLeft={1}>
          <Text color={i === cursor ? palette.accent : palette.textMuted}>{i === cursor ? '>' : ' '}</Text>
          <Box width={nameWidth}>
            <Text color={i === cursor ? palette.textPrimary : palette.brand} bold={i === cursor}>/{m.name}</Text>
          </Box>
          <Text color={i === cursor ? palette.textPrimary : palette.textMuted} dimColor={i !== cursor}>
            {m.description}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
