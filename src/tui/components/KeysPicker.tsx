/** tui/components/KeysPicker.tsx — Interactive API key manager (TYPING FIX) */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout, useStdin } from 'ink';
import { setKey, deleteKey } from '../../utils/keys.js';
import { C } from '../colors.js';

// Custom input hook for React 19 compatibility
function useKeyInput({ 
  active, 
  value, 
  onChange, 
  onSubmit 
}: { 
  active: boolean;
  value: string; 
  onChange: (v: string) => void; 
  onSubmit: (v: string) => void;
}) {
  const { stdin, setRawMode } = useStdin();
  
  useEffect(() => {
    if (!stdin || !active) return;
    setRawMode?.(true);
    
    const handler = (data: Buffer) => {
      const str = data.toString();
      if (str === '\r' || str === '\n') {
        onSubmit(value);
        return;
      }
      if (str === '\x7f' || str === '\b') {
        onChange(value.slice(0, -1));
        return;
      }
      if (str === '\x1b') return;
      if (str.length >= 1 && str.charCodeAt(0) >= 32) {
        onChange(value + str);
      }
    };
    
    stdin.on('data', handler);
    return () => { stdin.off('data', handler); setRawMode?.(false); };
  }, [stdin, active, value, onChange, onSubmit, setRawMode]);
}

const PROVIDER_KEYS = [
  { id: 'fireworks',  label: 'Fireworks AI',  envKey: 'FIREWORKS_API_KEY',  hint: 'fw-...'      },
  { id: 'anthropic',  label: 'Anthropic',      envKey: 'ANTHROPIC_API_KEY',  hint: 'sk-ant-...'  },
  { id: 'openai',     label: 'OpenAI',         envKey: 'OPENAI_API_KEY',     hint: 'sk-...'      },
  { id: 'gemini',     label: 'Google Gemini',  envKey: 'GEMINI_API_KEY',     hint: 'AIza...'     },
  { id: 'openrouter', label: 'OpenRouter',     envKey: 'OPENROUTER_API_KEY', hint: 'sk-or-...'   },
  { id: 'nvidia',     label: 'NVIDIA NIM',     envKey: 'NVIDIA_API_KEY',     hint: 'nvapi-...'   },
] as const;

interface Props {
  initialProvider?: string;
  onClose: () => void;
  onKeySaved?: (provider: string) => void;
}

export function KeysPicker({ initialProvider, onClose, onKeySaved }: Props) {
  const { stdout } = useStdout();
  const w = Math.min((stdout.columns ?? 80) - 4, 56);

  const initIdx = initialProvider
    ? Math.max(0, PROVIDER_KEYS.findIndex(p => p.id === initialProvider))
    : 0;

  const [cursor, setCursor] = useState(initIdx);
  const [entering, setEntering] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const prov = PROVIDER_KEYS[cursor]!;

  useInput((ch, key) => {
    if (key.escape || ch === 'q') { onClose(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(PROVIDER_KEYS.length - 1, c + 1)); return; }
    if (key.return)    { setEntering(true); setKeyValue(''); return; }
    if (ch === 'd' && process.env[prov.envKey]) {
      deleteKey(prov.envKey);
      delete process.env[prov.envKey];
      setSaved(null);
      return;
    }
  }, { isActive: !entering });

  function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) { setEntering(false); return; }
    setKey(prov.envKey, trimmed);
    process.env[prov.envKey] = trimmed;
    setSaved(prov.envKey);
    setEntering(false);
    onKeySaved?.(prov.id);
    setTimeout(onClose, 900);
  }

  useKeyInput({
    active: entering,
    value: keyValue,
    onChange: setKeyValue,
    onSubmit: handleSubmit
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}>
        <Text color={C.brand} bold>keys</Text>
        <Text color={C.textDim}>
          {entering ? 'paste key · enter · esc cancel' : '↑↓ enter  d=delete  esc'}
        </Text>
      </Box>
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>

      {PROVIDER_KEYS.map((p, i) => {
        const isSet = !!process.env[p.envKey];
        const isCur = i === cursor;
        const wasSaved = saved === p.envKey;
        return (
          <Box key={p.id} paddingLeft={1} gap={1}>
            <Text color={isCur ? C.brand : C.textDim}>{isCur ? '▸' : ' '}</Text>
            <Text color={isSet ? '#10B981' : C.textDim}>{isSet ? '✓' : '○'}</Text>
            <Text color={isCur ? C.textPrimary : C.textSecondary} bold={isCur}>
              {p.label}
            </Text>
            <Text color={C.textDim}>{p.envKey}</Text>
            {wasSaved && <Text color="#10B981"> ← saved</Text>}
          </Box>
        );
      })}

      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>

      {entering ? (
        <Box gap={1}>
          <Text color={C.brand}>{prov.envKey}=</Text>
          <Text color={C.textPrimary}>
            {keyValue || prov.hint}█
          </Text>
        </Box>
      ) : (
        <Text color={C.textDim}>
          {prov.label} · {process.env[prov.envKey] ? 'key set — enter to update, d to delete' : 'enter to set API key'}
        </Text>
      )}
    </Box>
  );
}
