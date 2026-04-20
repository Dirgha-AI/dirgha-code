import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { renderMd } from '../helpers.js';
import { LiveThinkingNode } from './LiveThinkingNode.js';

const SYMBOLS: any = { read: '∴', write: '⊕', shell: '∂', fetch: '⋈', git: '≡' };
const getSym = (n: string) => SYMBOLS[['read_file','glob','list_files','search_files'].includes(n)?'read':['write_file','edit_file','apply_patch','make_dir','delete_file'].includes(n)?'write':['bash','run_command'].includes(n)?'shell':'git'] || '∂';

export function LiveView({ timeline, busy }: any) {
  const { stdout } = useStdout(), [dim, setDim] = useState(false), [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick(n => n + 1), 1000), b = setInterval(() => setDim(d => !d), 1000);
    return () => { clearInterval(t); clearInterval(b); };
  }, [busy]);

  if (!busy) return null;
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const ev = timeline[i];
    if (ev.kind === 'thinking') nodes.push(<LiveThinkingNode key={i} i={i} text={ev.text} isActive={i === timeline.length-1} dim={dim} />);
    else if (ev.kind === 'tool') {
      if (!ev.done) nodes.push(
        <Box key={i} borderStyle="round" borderColor={dim ? C.textDim : C.brand} paddingX={1} marginBottom={1}>
          <Text color={dim ? C.textMuted : C.brand}>{getSym(ev.name)}</Text>
          <Text color={C.textSecondary} bold> {ev.label}</Text>
          {ev.arg && <Text color={C.textMuted}> {ev.arg.slice(-30)}</Text>}
        </Box>
      );
    } else if (ev.kind === 'text') {
      nodes.push(<Box key={i} marginTop={1}><Text color={C.textSecondary} wrap="wrap">{renderMd(ev.text)}</Text></Box>);
    }
  }
  return <Box flexDirection="column" paddingX={2}>{nodes.length ? nodes : <Text color={C.brand}>∇ thinking</Text>}</Box>;
}
