/**
 * commands/mcp.ts — MCP server CLI command
 * Start/stop/manage MCP context server
 * Subcommands: start, serve (stdio), install, status, stop
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { createDefaultMCPServer, MCPServer, startStdioTransport } from '../mcp/index.js';
import { readConfig } from '../utils/config.js';

let activeServer: MCPServer | null = null;

export const mcpCommand = new Command('mcp')
  .description('Model Context Protocol server management')
  .option('-p, --port <port>', 'Server port', '8080');

// dirgha mcp start — HTTP MCP server
mcpCommand
  .command('start')
  .description('Start HTTP MCP server')
  .option('-p, --port <port>', 'Server port', '8080')
  .action(async (opts) => {
    const port = parseInt(opts.port ?? '8080', 10);
    console.log(chalk.dim(`Starting MCP server on port ${port}…`));
    try {
      activeServer = await createDefaultMCPServer(port);
      activeServer.on('started', ({ port: p }) => {
        console.log(chalk.green('✓'), 'MCP server started on port', chalk.cyan(p));
        console.log(chalk.dim('  Endpoint:'), `http://localhost:${p}`);
      });
      await activeServer.start();
      process.on('SIGINT', async () => {
        await activeServer?.stop(); process.exit(0);
      });
    } catch (err: any) {
      console.error(chalk.red('✗'), 'Failed to start MCP server:', err.message);
      process.exit(1);
    }
  });

// dirgha mcp serve — stdio transport (for Claude Desktop integration)
mcpCommand
  .command('serve')
  .description('Start MCP stdio transport (for Claude Desktop)')
  .action(async () => {
    const server = await createDefaultMCPServer();
    startStdioTransport(server);
  });

// dirgha mcp install — write Claude Desktop config
mcpCommand
  .command('install')
  .description('Install Dirgha as an MCP server in Claude Desktop')
  .action(async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const configDir = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude')
      : path.join(os.homedir(), '.config', 'Claude');
    const configPath = path.join(configDir, 'claude_desktop_config.json');
    let existing: any = {};
    if (fs.existsSync(configPath)) {
      try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* fresh */ }
    }
    existing.mcpServers = existing.mcpServers ?? {};
    existing.mcpServers.dirgha = {
      command: process.execPath,
      args: [process.argv[1]!, 'mcp', 'serve'],
      description: 'Dirgha AI — full tool suite via MCP',
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    console.log(chalk.green('✓'), 'Installed Dirgha MCP server in Claude Desktop config');
    console.log(chalk.dim('  Config:'), configPath);
    console.log(chalk.dim('  Restart Claude Desktop to activate'));
  });

// dirgha mcp status
mcpCommand
  .command('status')
  .description('Show MCP server status')
  .action(() => {
    if (activeServer) {
      const stats = activeServer.getStats();
      console.log(chalk.green('✓'), 'MCP server running');
      console.log(chalk.dim('  Port:'), stats.port);
      console.log(chalk.dim('  Tools:'), stats.tools);
    } else {
      console.log(chalk.yellow('⚠'), 'No MCP server running. Use: dirgha mcp start');
    }
  });

// dirgha mcp stop
mcpCommand
  .command('stop')
  .description('Stop running MCP server')
  .action(async () => {
    if (activeServer) {
      await activeServer.stop();
      activeServer = null;
      console.log(chalk.green('✓'), 'MCP server stopped');
    } else {
      console.log(chalk.yellow('⚠'), 'No server to stop');
    }
  });

// Legacy: `dirgha mcp` with no subcommand defaults to status
mcpCommand.action(async (options) => {
  if (options.status || !process.argv[3]) {
    if (activeServer) {
      const stats = activeServer.getStats();
      console.log(chalk.green('✓'), 'MCP server running on port', stats.port);
    } else {
      console.log(chalk.yellow('⚠'), 'No MCP server running');
      console.log(chalk.dim('  dirgha mcp start   — HTTP server'));
      console.log(chalk.dim('  dirgha mcp serve   — stdio (Claude Desktop)'));
      console.log(chalk.dim('  dirgha mcp install — add to Claude Desktop config'));
    }
  }
});
