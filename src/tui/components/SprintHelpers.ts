export const formatElapsed = (ms: number): string => {
  if (!ms || ms < 0) return '0h 0m';
  const h = Math.floor(ms / (1000 * 60 * 60)), m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
};

export const getTaskIcon = (s: string): string => {
  const map: any = { completed: '∎', failed: '✗', running: '∿', pending: '○', skipped: '⊘', paused: '‖' };
  return map[s] || '○';
};

export const getStatusColor = (s: string): string => {
  const map: any = { completed: 'green', running: 'yellow', failed: 'red', pending: 'gray', paused: 'cyan', skipped: 'dim' };
  return map[s] || 'white';
};
