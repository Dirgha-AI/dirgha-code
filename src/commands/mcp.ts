/**
 * commands/mcp.ts — MCP server CLI command
 * Start/stop/manage MCP context server
 * Subcommands: start, serve (stdio), install, status, stop, marketplace
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { createDefaultMCPServer, MCPServer, startStdioTransport } from '../mcp/index.js';
import { readConfig } from '../utils/config.js';
import { MARKETPLACE, findEntry, filterEntries } from '../mcp/marketplace.js';

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

// dirgha mcp marketplace — list/search/info on curated MCP servers
const marketplace = mcpCommand
  .command('marketplace')
  .description('Browse curated MCP servers from the community directory');

marketplace
  .command('list')
  .alias('ls')
  .description('List all marketplace entries')
  .option('-q, --query <term>', 'Substring match on id, name, summary, or tags')
  .option('-t, --tag <tag>', 'Filter by tag (e.g. files, database, browser)')
  .option('--community', 'Only show community (non-official) entries')
  .option('--official', 'Only show official entries')
  .action((opts: { query?: string; tag?: string; community?: boolean; official?: boolean }) => {
    const tier = opts.official ? 'official' : opts.community ? 'community' : undefined;
    const results = filterEntries(opts.query, opts.tag, tier);
    if (results.length === 0) {
      console.log(chalk.yellow('No entries match.'));
      return;
    }
    const idW = Math.max(...results.map(e => e.id.length), 2) + 2;
    for (const e of results) {
      const badge = e.tier === 'official' ? chalk.cyan('official ') : chalk.gray('community');
      console.log(`  ${chalk.bold(e.id.padEnd(idW))}${badge}  ${e.summary}`);
    }
    console.log(chalk.dim(`\n  ${results.length} server${results.length === 1 ? '' : 's'}. Use: dirgha mcp marketplace info <id>`));
  });

marketplace
  .command('info <id>')
  .description('Show details for a specific MCP server')
  .action((id: string) => {
    const entry = findEntry(id);
    if (!entry) {
      console.error(chalk.red(`No marketplace entry: ${id}`));
      console.error(chalk.dim('  Run: dirgha mcp marketplace list'));
      process.exit(1);
    }
    const badge = entry.tier === 'official' ? chalk.cyan('[official]') : chalk.gray('[community]');
    console.log(`\n${chalk.bold(entry.name)} ${badge}`);
    console.log(chalk.gray(`  id:       ${entry.id}`));
    console.log(chalk.gray(`  author:   ${entry.author}`));
    console.log(chalk.gray(`  homepage: ${entry.homepage}`));
    console.log(chalk.gray(`  tags:     ${entry.tags.join(', ')}`));
    console.log(`\n${entry.description}\n`);
    console.log(chalk.bold('Install:'));
    const cmd = `${entry.install}${entry.args ? ' ' + entry.args.join(' ') : ''}`;
    console.log(`  ${chalk.cyan(cmd)}`);
    if (entry.env && entry.env.length > 0) {
      console.log(chalk.bold('\nRequired env vars:'));
      for (const ev of entry.env) {
        const tag = ev.required ? chalk.red('required') : chalk.dim('optional');
        console.log(`  ${chalk.cyan(ev.name.padEnd(30))} ${tag}  ${ev.description}`);
      }
    }
    console.log(chalk.dim(`\n  Wire-up: dirgha mcp marketplace install ${entry.id}`));
    console.log();
  });

marketplace
  .command('install <id>')
  .description('Print install + wire-up instructions (does not execute)')
  .action((id: string) => {
    const entry = findEntry(id);
    if (!entry) {
      console.error(chalk.red(`No marketplace entry: ${id}`));
      process.exit(1);
    }
    console.log(chalk.bold('Install this MCP server:'));
    const cmd = `${entry.install}${entry.args ? ' ' + entry.args.join(' ') : ''}`;
    console.log(`  ${chalk.cyan(cmd)}`);
    if (entry.env && entry.env.length > 0) {
      console.log(chalk.bold('\nSet env vars first:'));
      for (const ev of entry.env) {
        if (ev.required) console.log(`  export ${ev.name}=...`);
      }
    }
    console.log(chalk.bold('\nThen wire into Dirgha:'));
    console.log(`  dirgha mcp add ${entry.id} ${cmd.replace('npx -y ', 'npx ')}`);
    console.log(chalk.dim(`\n  Marketplace is curated at https://github.com/dirghaai/dirgha-code/blob/main/src/mcp/marketplace.ts — PR to add more.`));
    console.log();
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
