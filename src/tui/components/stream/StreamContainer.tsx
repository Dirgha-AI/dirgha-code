import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../../colors.js';
import { ToolItem } from './ToolItem.js';
import { StreamEvent } from './types.js';

type Item =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; chars: number }
  | { kind: 'tool'; tool: any; isDone: boolean; result?: string; isError?: boolean };

/** Claude-grade streaming: renders events in chronological order (text ↔ tools ↔ text). */
type Verbose = 'off' | 'new' | 'all' | 'verbose';
function verboseLevel(): Verbose {
  const v = (process.env['DIRGHA_VERBOSE'] ?? 'new').toLowerCase();
  return (['off', 'new', 'all', 'verbose'].includes(v) ? v : 'new') as Verbose;
}

export const StreamContainer = React.memo(({ events }: { events: StreamEvent[]; isStreaming?: boolean }) => {
  const { stdout } = useStdout();
  const cols = (stdout?.columns ?? 80) - 6;
  const verbose = verboseLevel();
  if (verbose === 'off') return null;

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];
    const toolIdx = new Map<string, number>();
    let textBuf = '';
    let thinkingChars = 0;

    const flushText = () => {
      if (textBuf) { out.push({ kind: 'text', content: textBuf }); textBuf = ''; }
    };
    const flushThinking = () => {
      if (thinkingChars > 0) { out.push({ kind: 'thinking', chars: thinkingChars }); thinkingChars = 0; }
    };

    for (const ev of events) {
      if (ev.type === 'text') {
        flushThinking();
        textBuf += ev.content ?? '';
      } else if (ev.type === 'thought') {
        thinkingChars += ev.content?.length || 0;
      } else if (ev.type === 'tool_start' && ev.tool) {
        flushThinking();
        flushText();
        const idx = out.push({ kind: 'tool', tool: ev.tool, isDone: false }) - 1;
        toolIdx.set(ev.tool.id, idx);
      } else if (ev.type === 'tool_end' && ev.toolId) {
        const i = toolIdx.get(ev.toolId);
        if (i != null) {
          const item = out[i];
          if (item && item.kind === 'tool') {
            item.isDone = true;
            item.result = ev.result;
            item.isError = ev.isError;
          }
        }
      }
    }
    flushThinking();
    flushText();
    return out;
  }, [events]);

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
      {items.map((it, i) => {
        if (it.kind === 'thinking') {
          return <Text key={i} color={C.textMuted}>⠋ thinking… ({it.chars} chars)</Text>;
        }
        if (it.kind === 'tool') {
          return <ToolItem key={i} tool={it.tool} isDone={it.isDone} result={it.result} isError={it.isError} />;
        }
        return (
          <Box key={i} gap={2} width={cols}>
            <Text color={C.brand}>✦</Text>
            <Text color={C.textPrimary} wrap="wrap">{it.content}</Text>
          </Box>
        );
      })}
    </Box>
  );
});
