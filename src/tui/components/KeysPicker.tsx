import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { setKey, deleteKey } from '../../utils/keys.js';
import { C } from '../colors.js';
import { useKeyInput } from './useKeyInput.js';

const KEYS = [
  { id: 'fireworks', label: 'Fireworks AI', envKey: 'FIREWORKS_API_KEY', hint: 'fw-...' },
  { id: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', hint: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY', hint: 'sk-...' },
  { id: 'gemini', label: 'Google Gemini', envKey: 'GEMINI_API_KEY', hint: 'AIza...' },
  { id: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', hint: 'sk-or-...' },
  { id: 'nvidia', label: 'NVIDIA NIM', envKey: 'NVIDIA_API_KEY', hint: 'nvapi-...' },
];

export function KeysPicker({ initialProvider, onClose, onKeySaved }: any) {
  const { stdout } = useStdout(), w = Math.min((stdout.columns ?? 80) - 4, 56);
  const [cursor, setCursor] = useState(initialProvider ? Math.max(0, KEYS.findIndex(p => p.id === initialProvider)) : 0);
  const [entering, setEntering] = useState(false), [val, setVal] = useState(''), [saved, setSaved] = useState<string | null>(null);
  const prov = KEYS[cursor]!;

  useInput((ch, key) => {
    if (key.escape || ch === 'q') onClose();
    else if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    else if (key.downArrow) setCursor(c => Math.min(KEYS.length - 1, c + 1));
    else if (key.return) { setEntering(true); setVal(''); }
    else if (ch === 'd' && process.env[prov.envKey]) { deleteKey(prov.envKey); delete process.env[prov.envKey]; setSaved(null); }
  }, { isActive: !entering });

  const onSubmit = (v: string) => {
    const t = v.trim(); if (!t) { setEntering(false); return; }
    setKey(prov.envKey, t); process.env[prov.envKey] = t; setSaved(prov.envKey); setEntering(false);
    onKeySaved?.(prov.id); setTimeout(onClose, 900);
  };
  useKeyInput({ active: entering, value: val, onChange: setVal, onSubmit });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}><Text color={C.brand} bold>keys</Text><Text color={C.textDim}>{entering ? 'paste key · enter · esc cancel' : '↑↓ enter  d=delete  esc'}</Text></Box>
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      {KEYS.map((p, i) => (
        <Box key={p.id} paddingLeft={1} gap={1}>
          <Text color={i === cursor ? C.brand : C.textDim}>{i === cursor ? '>' : ' '}</Text>
          <Text color={process.env[p.envKey] ? '#10B981' : C.textDim}>{process.env[p.envKey] ? '✓' : '○'}</Text>
          <Text color={i === cursor ? C.textPrimary : C.textSecondary} bold={i === cursor}>{p.label}</Text>
          {saved === p.envKey && <Text color="#10B981"> ← saved</Text>}
        </Box>
      ))}
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      {entering ? <Box gap={1}><Text color={C.brand}>{prov.envKey}=</Text><Text color={C.textPrimary}>{val || prov.hint}█</Text></Box> 
                : <Text color={C.textDim}>{prov.label} · {process.env[prov.envKey] ? 'key set' : 'enter to set'}</Text>}
    </Box>
  );
}
