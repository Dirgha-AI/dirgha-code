/**
 * Autocomplete and fuzzy matching for CLI
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';

// 40+ commands list for completion
export const COMMANDS = [
  'init', 'chat', 'status', 'doctor', 'curate', 'query', 'remember', 'recall',
  'compact', 'export', 'import', 'session', 'checkpoint', 'rollback', 'sync',
  'btw', 'yolo', 'ensemble', 'browser', 'connect', 'query-data', 'scratchpad',
  'capture', 'swarm', 'bucky', 'mesh', 'scan', 'update', 'login', 'auth',
  'models', 'analytics', 'voice-entry', 'setup', 'local', 'dao', 'mcp',
  'make', 'pay', 'stats', 'config', 'help', 'version', 'agent-swarm',
  'join-mesh', 'unified-memory', 'setup-local', 'export-session', 'import-session',
];

// Fuzzy match score
export function fuzzyMatch(input: string, target: string): number {
  input = input.toLowerCase();
  target = target.toLowerCase();
  
  if (target.startsWith(input)) return 3; // prefix match
  if (target.includes(input)) return 2;    // substring match
  
  // Character distance scoring
  let score = 0;
  let ti = 0;
  for (let i = 0; i < input.length && ti < target.length; i++) {
    const idx = target.indexOf(input[i], ti);
    if (idx >= 0) {
      score += 1 / (idx - ti + 1);
      ti = idx + 1;
    }
  }
  return score > 0 ? score / input.length : 0;
}

// Find best matches
export function suggestCommands(input: string, limit = 5): string[] {
  return COMMANDS
    .map(c => ({ cmd: c, score: fuzzyMatch(input, c) }))
    .filter(x => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.cmd);
}

// Register autocomplete command
export function registerAutocompleteCommand(program: Command): void {
  program
    .command('complete [prefix]')
    .description('Show command completions')
    .action((prefix: string = '') => {
      const matches = suggestCommands(prefix, 10);
      if (matches.length === 0) {
        console.log(chalk.dim('No matches'));
        return;
      }
      for (const m of matches) {
        console.log(m);
      }
    });

  program
    .command('commands')
    .description('List all available commands')
    .action(() => {
      console.log(chalk.bold('Available Commands:\n'));
      
      const groups: Record<string, string[]> = {
        'Core': ['init', 'chat', 'status', 'doctor', 'help', 'version'],
        'Knowledge': ['curate', 'query', 'remember', 'recall', 'compact'],
        'Session': ['session', 'export', 'import', 'checkpoint', 'rollback', 'sync'],
        'Quick': ['btw', 'yolo'],
        'Agents': ['ensemble', 'swarm', 'bucky', 'agent-swarm'],
        'Tools': ['browser', 'capture', 'connect', 'query-data', 'scratchpad', 'scan'],
        'Mesh': ['mesh', 'join-mesh'],
        'Setup': ['login', 'auth', 'setup', 'setup-local', 'local'],
        'System': ['models', 'analytics', 'stats', 'mcp', 'voice-entry', 'dao', 'make', 'pay', 'config'],
      };
      
      for (const [group, cmds] of Object.entries(groups)) {
        console.log(chalk.cyan(`${group}:`));
        for (const c of cmds) {
          const found = COMMANDS.includes(c);
          console.log(`  ${found ? chalk.green('✓') : chalk.gray('○')} ${c}`);
        }
        console.log();
      }
    });
}

// Hook for unknown command suggestions
export function suggestOnUnknown(input: string): void {
  const suggestions = suggestCommands(input, 3);
  if (suggestions.length > 0) {
    console.log(chalk.yellow(`\nDid you mean: ${suggestions.map(s => chalk.cyan(s)).join(', ')}?`));
  }
}
