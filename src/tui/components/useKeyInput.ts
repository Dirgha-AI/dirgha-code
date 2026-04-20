import { useEffect } from 'react';
import { useStdin } from 'ink';

export function useKeyInput({ 
  active, value, onChange, onSubmit 
}: { 
  active: boolean; value: string; onChange: (v: string) => void; onSubmit: (v: string) => void;
}) {
  const { stdin, setRawMode } = useStdin();
  useEffect(() => {
    if (!stdin || !active) return;
    setRawMode?.(true);
    const handler = (data: Buffer) => {
      const str = data.toString();
      if (str === '\r' || str === '\n') { onSubmit(value); return; }
      if (str === '\x7f' || str === '\b') { onChange(value.slice(0, -1)); return; }
      if (str === '\x1b') return;
      if (str.length >= 1 && str.charCodeAt(0) >= 32) onChange(value + str);
    };
    stdin.on('data', handler);
    return () => { stdin.off('data', handler); setRawMode?.(false); };
  }, [stdin, active, value, onChange, onSubmit, setRawMode]);
}
