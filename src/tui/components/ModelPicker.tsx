/** tui/components/ModelPicker.tsx */
import React, { useState, useEffect } from 'react';
import fs from 'fs';
import { Box, Text, useInput, useStdout } from 'ink';
import { MODELS, TAG_COLORS, PROV_ORDER, PROV_MAP } from '../constants.js';
import { C } from '../colors.js';

interface Props { current: string; onSelect: (id: string, provider?: string) => void; onClose: () => void; }

const INLINE_LOCAL_MODELS = [
  { id: 'llamacpp',    name: 'Gemma 3 1B', provider: 'Local', sizeGB: 0.77, filename: 'gemma-3-1b-it-Q4_K_M.gguf' },
  { id: 'llamacpp-4b', name: 'Gemma 3 4B', provider: 'Local', sizeGB: 2.5,  filename: 'gemma-3-4b-it-Q4_K_M.gguf' },
];

const MODELS_DIR = '/root/models';

function fileExists(filename: string): boolean {
  try { return fs.existsSync(`${MODELS_DIR}/${filename}`); } catch { return false; }
}

export function ModelPicker({ current, onSelect, onClose }: Props) {
  const { stdout } = useStdout();
  const w = Math.min((stdout.columns ?? 80) - 4, 56);

  const totalLen = MODELS.length + INLINE_LOCAL_MODELS.length;

  const [cursor, setCursor] = useState(() => {
    const idx = MODELS.findIndex(m => m.id === current);
    return idx >= 0 ? idx : 0;
  });

  const [llamaRunning, setLlamaRunning] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8082/health')
      .then(r => r.ok && setLlamaRunning(true))
      .catch(() => {/* not running */});
  }, []);

  useInput((ch, key) => {
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(totalLen - 1, c + 1)); return; }
    if (key.return) {
      if (cursor < MODELS.length) { onSelect(MODELS[cursor]!.id); onClose(); return; }
      const local = INLINE_LOCAL_MODELS[cursor - MODELS.length]!;
      if (llamaRunning) { onSelect(local.id, 'gateway'); onClose(); }
      return;
    }
    if (key.escape || ch === 'q') { onClose(); return; }
    const n = parseInt(ch, 10);
    if (n >= 1 && n <= 9 && n <= MODELS.length) { onSelect(MODELS[n - 1]!.id); onClose(); }
  });

  const curModel = cursor < MODELS.length ? MODELS[cursor]! : null;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}>
        <Text color={C.brand} bold>model</Text>
        <Text color={C.textDim}>↑↓ enter  1–9  esc</Text>
      </Box>
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>

      {PROV_ORDER.map(prov => (
        <Box key={prov} flexDirection="column">
          <Text color={C.textDim} dimColor>{PROV_MAP[prov]![0]!.display}</Text>
          {PROV_MAP[prov]!.map(m => {
            const isCur = m.num - 1 === cursor;
            const isSel = m.id === current;
            return (
              <Box key={m.id} paddingLeft={2} gap={1}>
                <Text color={isCur ? C.brand : C.textDim}>{isCur ? '▸' : isSel ? '✓' : ' '}</Text>
                <Text color={C.textDim}>{m.num <= 9 ? String(m.num) : ' '}</Text>
                <Text color={isCur ? C.textPrimary : isSel ? C.brand : C.textSecondary} bold={isCur}>
                  {m.label}
                </Text>
                <Text color={isCur ? (TAG_COLORS[m.tag] ?? C.textMuted) : C.textDim}>{m.tag}</Text>
              </Box>
            );
          })}
        </Box>
      ))}

      {/* LOCAL section */}
      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      <Text color={C.textDim} dimColor>{'  ─── LOCAL  (offline · private · free) ───'}</Text>
      {INLINE_LOCAL_MODELS.map((lm, i) => {
        const idx = MODELS.length + i;
        const isCur = cursor === idx;
        const downloaded = fileExists(lm.filename);
        const statusText = llamaRunning && downloaded ? '● running' : downloaded ? '✓ downloaded' : '↓ /setup local';
        const statusColor = llamaRunning && downloaded ? C.brand : downloaded ? '#10B981' : C.textMuted;
        return (
          <Box key={lm.id} paddingLeft={2} gap={1}>
            <Text color={isCur ? C.brand : C.textDim}>{isCur ? '▸' : ' '}</Text>
            <Text color={isCur ? C.textPrimary : C.textSecondary} bold={isCur}>{lm.name}</Text>
            <Text color={C.textDim}>{lm.sizeGB} GB</Text>
            <Text color={C.textDim}>{lm.provider}</Text>
            <Text color={statusColor}>{statusText}</Text>
          </Box>
        );
      })}

      <Text color={C.borderSubtle}>{'─'.repeat(w)}</Text>
      <Box gap={1}>
        {curModel
          ? <><Text color={C.brand}>{curModel.label}</Text><Text color={C.textDim}>{curModel.display}</Text></>
          : <Text color={C.textDim}>local model — {llamaRunning ? 'server up' : 'not running'}</Text>
        }
      </Box>
    </Box>
  );
}
