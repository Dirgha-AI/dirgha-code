/**
 * hub/commands.ts — CLI-Hub subcommands implementation.
 * hub install, hub list, hub search, hub remove
 */
import chalk from 'chalk';
import type { AgentOutput } from '../agent/types.js';
import { fetchRegistry, searchPlugins, getPlugin, listCategories } from './registry.js';
import { installPlugin, removePlugin, listInstalled } from './installer.js';
import type { InstallOptions } from './types.js';

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
