import React, { useState, useEffect } from 'react';
import fs from 'fs';
import { Box, Text, useInput, useStdout } from 'ink';
import { MODELS, PROV_ORDER, PROV_MAP } from '../constants.js';
import { C } from '../colors.js';
import { ModelRow } from './ModelRow.js';
import { LocalModelRow } from './LocalModelRow.js';

const LOCAL_MODELS = [
  { id: 'llamacpp', name: 'Gemma 3 1B', provider: 'Local', sizeGB: 0.77, filename: 'gemma-3-1b-it-Q4_K_M.gguf' },
  { id: 'llamacpp-4b', name: 'Gemma 3 4B', provider: 'Local', sizeGB: 2.5, filename: 'gemma-3-4b-it-Q4_K_M.gguf' },
];

export function ModelPicker({ current, onSelect, onClose }: any) {
  const { stdout } = useStdout();
  const w = Math.min((stdout.columns ?? 80) - 4, 56);
  const [cursor, setCursor] = useState(() => Math.max(0, MODELS.findIndex(m => m.id === current)));
  const [llama, setLlama] = useState(false);

  useEffect(() => { fetch('http://localhost:8082/health').then(r => r.ok && setLlama(true)).catch(() => {}); }, []);

  useInput((ch, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    else if (key.downArrow) setCursor(c => Math.min(MODELS.length + LOCAL_MODELS.length - 1, c + 1));
    else if (key.return) {
      if (cursor < MODELS.length) onSelect(MODELS[cursor]!.id);
      else if (llama) onSelect(LOCAL_MODELS[cursor - MODELS.length]!.id, 'gateway');
      onClose();
    } else if (key.escape || ch === 'q') onClose();
    else if (/^[1-9]$/.test(ch) && Number(ch) <= MODELS.length) { onSelect(MODELS[Number(ch)-1]!.id); onClose(); }
  });

  const cur = cursor < MODELS.length ? MODELS[cursor]! : null;
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}><Text color={C.brand} bold>model</Text><Text color={C.textDim}>↑↓ enter  1–9  esc</Text></Box>
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      {PROV_ORDER.map(p => (
        <Box key={p} flexDirection="column">
          <Text color={C.textDim} dimColor>{PROV_MAP[p]![0]!.display}</Text>
          {PROV_MAP[p]!.map(m => <ModelRow key={m.id} model={m} isCursor={m.num - 1 === cursor} isSelected={m.id === current} />)}
        </Box>
      ))}
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      {LOCAL_MODELS.map((m, i) => <LocalModelRow key={m.id} model={m} isCursor={cursor === MODELS.length + i} exists={fs.existsSync(`/root/models/${m.filename}`)} running={llama} />)}
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      <Box gap={1}>{cur ? <><Text color={C.brand}>{cur.label}</Text><Text color={C.textDim}>{cur.display}</Text></> : <Text color={C.textDim}>local model — {llama ? 'up' : 'off'}</Text>}</Box>
    </Box>
  );
}
