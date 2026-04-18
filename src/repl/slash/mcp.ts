/**
 * repl/slash/mcp.ts — MCP Client slash commands
 * Sprint 15: MCP Support
 */
import chalk from 'chalk';
import { mcpManager } from '../../mcp/manager.js';
import type { SlashCommand } from './types.js';

export const mcpCommands: SlashCommand[] = [
  {
    name: 'mcp',
    description: 'Manage Model Context Protocol connections',
    args: '<subcommand> [args]',
    category: 'system',
    handler: async (args) => {
      const [sub, ...rest] = args.trim().split(/\s+/);

      if (sub === 'connect') {
        const type = rest[0]; // http | stdio
        const name = rest[1];
        const target = rest[2];

        if (!type || !name || !target) {
          return chalk.red('Usage: /mcp connect <http|stdio> <name> <url|command>');
        }

        try {
          if (type === 'http') {
            await mcpManager.addClient({ name, type: 'http', url: target });
          } else if (type === 'stdio') {
            await mcpManager.addClient({ name, type: 'stdio', command: target, args: rest.slice(3) });
          } else {
            return chalk.red('Invalid type. Must be "http" or "stdio"');
          }
          return chalk.green(`✓ Connected to MCP server: ${name}`);
        } catch (err: any) {
          return chalk.red(`✗ Connection failed: ${err.message}`);
        }
      }

      if (sub === 'list') {
        const tools = await mcpManager.listAllTools();
        if (tools.length === 0) return chalk.yellow('No MCP tools available.');
        
        let out = chalk.bold('\nAvailable MCP Tools:\n');
        for (const tool of tools) {
          out += `  ${chalk.cyan(tool.name)}: ${tool.description}\n`;
        }
        return out;
      }

      if (sub === 'servers' || sub === 'status') {
        const servers = mcpManager.getConnectedServers();
        if (servers.length === 0) return chalk.yellow('No MCP servers connected.');
        
        return chalk.bold('\nConnected MCP Servers:\n') + 
               servers.map(s => `  ${chalk.green('●')} ${s}`).join('\n');
      }

      if (sub === 'disconnect') {
        await mcpManager.disconnectAll();
        return chalk.green('✓ All MCP servers disconnected.');
      }

      return chalk.dim('Usage: /mcp <connect | list | servers | disconnect>');
    },
  },
];
