/**
 * repl/slash/index.ts — Slash command dispatcher and registry
 * Re-exports all commands from category modules
 */
import type { SlashCommand, ReplContext } from './types.js';
import { sessionCommands } from './session.js';
import { configCommands } from './config.js';
import { safetyCommands } from './safety.js';
import { memoryCommands } from './memory.js';
import { gitCommands } from './git.js';
import { gitExtCommands } from './git-ext.js';
import { devCommands } from './dev.js';
import { cronCommands } from './cron.js';
import { knowledgeCommands } from './knowledge.js';
import { contextCommands } from './context.js';
import { searchCommands } from './search.js';
import { screenCommands } from './screen.js';
import { multimodalCommands } from '../../multimodal/index.js';
import { securityCommands } from './security.js';
import { fsCommands } from './fs.js';
import { netCommands } from './net.js';
import { teamCommands } from './team.js';
import { consensusCommands } from './consensus.js';
import { agentDiscoveryCommands } from './agent-discovery.js';
import { orchestrationCommands } from './orchestration.js';
import { voiceCommands } from './voice.js';
import { localCommands } from './local.js';
import { mcpCommands } from './mcp.js';
import { verifyCommands } from './verify.js';
import { sprintCommands } from './sprint.js';
import themeCommand from './theme.js';
import chalk from 'chalk';
import { getTheme } from '../themes.js';

// Build registry from all command modules
const registry: SlashCommand[] = [
  ...sessionCommands,
  ...configCommands,
  ...safetyCommands,
  ...memoryCommands,
  ...gitCommands,
  ...gitExtCommands,
  ...devCommands,
  ...cronCommands,
  ...knowledgeCommands,
  ...contextCommands,
  ...searchCommands,
  ...screenCommands,
  ...teamCommands,
  ...consensusCommands,
  ...agentDiscoveryCommands,
  ...orchestrationCommands,
  ...multimodalCommands,
  ...securityCommands,
  ...fsCommands,
  ...netCommands,
  ...voiceCommands,
  ...localCommands,
  ...mcpCommands,
  ...verifyCommands,
  ...sprintCommands,
  themeCommand,
];

// Override help handler to have access to full registry
const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show all available commands',
  category: 'session',
  handler: () => {
    const t = getTheme();
    const byCategory = new Map<string, SlashCommand[]>();
    for (const cmd of registry) {
      const cat = cmd.category ?? 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(cmd);
    }
    let out = '\n';
    for (const [cat, cmds] of byCategory) {
      out += t.header(`  ${(cat ?? 'other').toUpperCase()}\n`);
      for (const cmd of cmds) {
        const name = t.primary(`/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}`);
        const aliases = cmd.aliases ? t.dim(` (${cmd.aliases.map(a => `/${a}`).join(', ')})`) : '';
        out += `    ${name}${aliases}  ${chalk.white(cmd.description)}\n`;
      }
      out += '\n';
    }
    return out;
  },
};

// Replace help in registry
const finalRegistry = registry.map(c => c.name === 'help' ? helpCommand : c);

export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}

export function parseSlash(input: string): { name: string; args: string } {
  const trimmed = input.trimStart().slice(1);
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { name: trimmed.toLowerCase(), args: '' };
  return { name: trimmed.slice(0, spaceIdx).toLowerCase(), args: trimmed.slice(spaceIdx + 1) };
}

export async function handleSlash(input: string, ctx: ReplContext): Promise<boolean> {
  const { name, args } = parseSlash(input);

  // Prefer the caller's stream for output (TUI pushes into the message list).
  // Fall back to stdout for non-TUI callers (scripts, tests).
  const emit = (text: string) => {
    if (!text) return;
    if (ctx.print) ctx.print(text);
    else if (ctx.stream?.markdown) ctx.stream.markdown(text);
    else process.stdout.write(text + '\n');
  };

  const cmd = finalRegistry.find(c => c.name === name || c.aliases?.includes(name));
  if (!cmd) {
    // Recipe fallback
    const { loadRecipe } = await import('../../recipes/loader.js');
    const { runRecipe } = await import('../../recipes/runner.js');
    const recipe = loadRecipe(name);
    if (recipe) {
      const params: Record<string, string> = {};
      if (args.trim()) {
        for (const pair of args.trim().split(/\s+/)) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx !== -1) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        }
      }
      const model = ctx.model ?? 'auto';
      try {
        await runRecipe(recipe, params, model, emit, () => {});
        emit(chalk.dim(`Recipe '${name}' completed.`));
      } catch (e: any) {
        emit(chalk.red(e.message ?? String(e)));
      }
      return true;
    }
    emit(chalk.red(`Unknown command: /${name}. Type /help for commands.`));
    return true;
  }

  if (cmd.execute) {
    await cmd.execute(args, ctx as any);
  } else if (cmd.handler) {
    const result = await cmd.handler(args, ctx as any);
    if (typeof result === 'string' && result) emit(result);
  }
  return true;
}

export function getCompletions(partial: string): string[] {
  const name = partial.slice(1).toLowerCase();
  return finalRegistry
    .filter(c => (c.name ?? '').startsWith(name) || c.aliases?.some(a => a.startsWith(name)))
    .map(c => `/${c.name ?? ''}`);
}

/**
 * Auto-complete a partial slash command to its first matching command.
 * Returns null if no match or if input is already complete.
 */
export function autoCompleteSlash(partial: string): string | null {
  if (!partial.startsWith('/')) return null;
  const name = partial.slice(1).toLowerCase().trim();
  if (!name) return null; // Just "/" - don't auto-complete
  
  // Find first match
  const match = finalRegistry.find(
    c => (c.name ?? '').startsWith(name) || c.aliases?.some(a => a.startsWith(name))
  );
  
  if (!match) return null;
  
  const fullCommand = `/${match.name}`;
  // Don't auto-complete if already complete (case-insensitive comparison)
  if (fullCommand.toLowerCase() === partial.toLowerCase()) return null;

  return fullCommand;
}

/** Register additional command modules without touching this file. */
export function extendRegistry(commands: SlashCommand[]): void {
  finalRegistry.push(...commands);
}

// Re-export types
export type { SlashCommand, ReplContext } from './types.js';
export { gitExtCommands } from './git-ext.js';
export { contextCommands } from './context.js';
export { searchCommands } from './search.js';
export { screenCommands } from './screen.js';
export { teamCommands } from './team.js';
export { consensusCommands } from './consensus.js';
export { agentDiscoveryCommands } from './agent-discovery.js';
export { orchestrationCommands } from './orchestration.js';
