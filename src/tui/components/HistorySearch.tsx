/**
 * tui/components/HistorySearch.tsx — Ctrl+R incremental history search overlay
 * TYPING FIX: Removed ink-text-input, using custom input hook
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { C } from '../colors.js';

// Custom text input for React 19 compatibility
function useSimpleInput({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const { stdin, setRawMode } = useStdin();
  
  useEffect(() => {
    if (!stdin) return;
    setRawMode?.(true);
    
    const handler = (data: Buffer) => {
      const str = data.toString();
      if (str === '\r' || str === '\n') {
        onSubmit();
        return;
      }
      if (str === '\x7f' || str === '\b') {
        onChange(value.slice(0, -1));
        return;
      }
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        onChange(value + str);
      } else if (str.length > 1) {
        onChange(value + str);
      }
    };
    
    stdin.on('data', handler);
    return () => { stdin.off('data', handler); setRawMode?.(false); };
  }, [stdin, value, onChange, onSubmit, setRawMode]);
}

interface HistorySearchProps {
  history: string[];
  onSelect: (entry: string) => void;
  onCancel: () => void;
}

export function HistorySearch({ history, onSelect, onCancel }: HistorySearchProps) {
  const [query, setQuery] = useState('');

  const matches = query
    ? history.filter(h => h.toLowerCase().includes(query.toLowerCase())).reverse().slice(0, 8)
    : history.slice(-8).reverse();

  useInput((_ch, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return && matches.length > 0) {
      onSelect(matches[0]!);
    }
  });

  // Custom input hook
  useSimpleInput({
    value: query,
    onChange: setQuery,
    onSubmit: () => { if (matches.length > 0) onSelect(matches[0]!); }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.accent} paddingX={1} marginTop={1}>
      <Box>
        <Text color={C.accent} bold>history-search: </Text>
        <Text color={query ? C.textPrimary : C.textDim}>
          {query || 'type to filter…'}█
        </Text>
      </Box>
      {matches.map((m, i) => (
        <Text key={i} color={i === 0 ? C.brand : C.textDim} dimColor={i !== 0}>
          {i === 0 ? '> ' : '  '}{m}
        </Text>
      ))}
      {matches.length === 0 && <Text color={C.textDim}>(no matches)</Text>}
      <Text color={C.textDim} dimColor>Enter to select · Esc to cancel</Text>
    </Box>
  );
}
