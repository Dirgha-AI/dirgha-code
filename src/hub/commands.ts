/**
 * hub/commands.ts — CLI-Hub subcommands implementation.
 * hub install, hub list, hub search, hub remove
 */
import chalk from 'chalk';
import type { Command } from 'commander';
import type { AgentOutput } from '../agent/types.js';
import { writeRaw } from '../agent/output.js';
import { fetchRegistry, searchPlugins, getPlugin, listCategories } from './registry.js';
import { installPlugin, removePlugin, listInstalled } from './installer.js';
import type { InstallOptions } from './types.js';

/** Emit an AgentOutput either as human text or JSON (respects --json global flag). */
function emit(out: AgentOutput, localJson?: boolean): void {
  const jsonMode = !!localJson || process.env['DIRGHA_JSON_OUTPUT'] === '1';
  if (jsonMode) {
    // writeRaw bypasses the universal stdout-capture wrapper so native
    // JSON reaches the terminal even when --json is globally enabled.
    writeRaw(JSON.stringify(out, null, 2) + '\n');
    (globalThis as any).__DIRGHA_JSON_NATIVELY_EMITTED__ = true;
  } else {
    process.stdout.write(out.text + '\n');
  }
  if (out.exitCode !== 0) process.exitCode = out.exitCode;
}

/** hub search <query> [--category] */
export async function hubSearch(
  query: string,
  category?: string
): Promise<AgentOutput> {
  const results = await searchPlugins(query, category as any);
  
  return {
    data: { results, count: results.length },
    text: results.length === 0 
      ? `No plugins found for "${query}"`
      : results.map(p => 
          `${chalk.cyan(p.name)} ${chalk.dim(p.version)} - ${p.description}\n` +
          `  ${chalk.yellow('★'.repeat(Math.round(p.rating)))} ${p.downloads} downloads | ${p.categories.join(', ')}`
        ).join('\n\n'),
    exitCode: 0,
    command: 'hub search',
    timestamp: new Date().toISOString()
  };
}

/** hub install <name> [--version] [--force] */
export async function hubInstall(
  name: string,
  opts: InstallOptions
): Promise<AgentOutput> {
  const entry = await getPlugin(name);
  if (!entry) {
    return {
      text: `Plugin "${name}" not found in registry`,
      exitCode: 1,
      command: 'hub install',
      timestamp: new Date().toISOString(),
      suggestions: [`Run "dirgha hub search ${name}" to find similar plugins`]
    };
  }
  
  try {
    const result = await installPlugin(entry, opts);
    
    const actionText = result.action === 'installed' ? 'Installed' : 
                       result.action === 'updated' ? 'Updated' : 'Skipped';
    
    return {
      data: result,
      text: `${actionText} ${chalk.cyan(result.plugin.name)}@${result.plugin.version}\n` +
            `Location: ${chalk.dim(result.path)}\n` +
            (result.dependencies.length ? `Dependencies: ${result.dependencies.join(', ')}\n` : ''),
      exitCode: 0,
      command: 'hub install',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      text: `Failed to install ${name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      exitCode: 1,
      command: 'hub install',
      timestamp: new Date().toISOString()
    };
  }
}

/** hub list [--installed] */
export async function hubList(installed = false): Promise<AgentOutput> {
  if (installed) {
    const plugins = listInstalled();
    return {
      data: { plugins },
      text: plugins.length === 0
        ? 'No plugins installed. Run "dirgha hub search <query>" to find plugins.'
        : plugins.map(p => 
            `${chalk.cyan(p.name)} ${chalk.dim(p.version)} - ${p.description}`
          ).join('\n'),
      exitCode: 0,
      command: 'hub list',
      timestamp: new Date().toISOString()
    };
  }
  
  const registry = await fetchRegistry();
  const topPlugins = registry.plugins
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 20);
  
  return {
    data: { plugins: topPlugins, total: registry.plugins.length },
    text: `Top ${topPlugins.length} plugins (of ${registry.plugins.length} total):\n\n` +
          topPlugins.map(p => 
            `${chalk.cyan(p.name)} ${chalk.dim(p.version)} - ${p.description}\n` +
            `  ${p.downloads} downloads | ${p.categories.join(', ')}`
          ).join('\n\n'),
    exitCode: 0,
    command: 'hub list',
    timestamp: new Date().toISOString()
  };
}

/** hub remove <name> */
export async function hubRemove(name: string): Promise<AgentOutput> {
  const success = removePlugin(name);
  
  return {
    text: success 
      ? `Removed ${chalk.cyan(name)}`
      : `Plugin "${name}" is not installed`,
    exitCode: success ? 0 : 1,
    command: 'hub remove',
    timestamp: new Date().toISOString(),
    suggestions: success ? undefined : ['Run "dirgha hub list --installed" to see installed plugins']
  };
}

/** hub info <name> */
export async function hubInfo(name: string): Promise<AgentOutput> {
  const entry = await getPlugin(name);
  if (!entry) {
    return {
      text: `Plugin "${name}" not found`,
      exitCode: 1,
      command: 'hub info',
      timestamp: new Date().toISOString()
    };
  }
  
  return {
    data: entry,
    text: `${chalk.cyan(entry.name)} ${chalk.dim(entry.version)}\n` +
          `${entry.description}\n\n` +
          `Author: ${entry.author}\n` +
          `Downloads: ${entry.downloads}\n` +
          `Rating: ${'★'.repeat(Math.round(entry.rating))}\n` +
          `Categories: ${entry.categories.join(', ')}\n` +
          `Updated: ${entry.updatedAt}\n` +
          (entry.sources.github ? `GitHub: ${entry.sources.github}\n` : '') +
          (entry.sources.npm ? `npm: ${entry.sources.npm}\n` : ''),
    exitCode: 0,
    command: 'hub info',
    timestamp: new Date().toISOString()
  };
}

/** Wire CLI-Hub subcommands into commander. */
export function registerHubCommands(program: Command): void {
  const hub = program.command('hub').description('CLI-Hub plugin manager (install/list/search/remove)');

  hub.command('search <query>')
    .description('Search the plugin registry')
    .option('-c, --category <name>', 'Filter by category')
    .action(async (query: string, opts: { category?: string; json?: boolean }) => {
      emit(await hubSearch(query, opts.category), !!opts.json);
    });

  hub.command('install <name>')
    .description('Install a plugin from the registry')
    .option('--version <ver>', 'Install a specific version')
    .option('-f, --force', 'Reinstall if already installed')
    .action(async (name: string, opts: InstallOptions & { json?: boolean }) => {
      emit(await hubInstall(name, opts), !!opts.json);
    });

  hub.command('list')
    .description('List plugins (default: top 20 from registry)')
    .option('-i, --installed', 'Show only installed plugins')
    .action(async (opts: { installed?: boolean; json?: boolean }) => {
      emit(await hubList(!!opts.installed), !!opts.json);
    });

  hub.command('remove <name>')
    .description('Uninstall a plugin')
    .action(async (name: string, opts: { json?: boolean }) => {
      emit(await hubRemove(name), !!opts.json);
    });

  hub.command('info <name>')
    .description('Show plugin metadata')
    .action(async (name: string, opts: { json?: boolean }) => {
      emit(await hubInfo(name), !!opts.json);
    });

  hub.command('categories')
    .description('List plugin categories')
    .action(async (opts: { json?: boolean }) => {
      const cats = await listCategories();
      const entries = Object.entries(cats) as Array<[string, number]>;
      emit({
        data: { categories: cats },
        text: entries.length === 0
          ? 'No categories'
          : entries.map(([name, count]) => `· ${name} (${count})`).join('\n'),
        exitCode: 0,
        command: 'hub categories',
        timestamp: new Date().toISOString(),
      }, !!opts.json);
    });
}
