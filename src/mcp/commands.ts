/**
 * mcp/commands.ts — dirgha mcp serve command
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { createDefaultMCPServer, startStdioTransport } from './server.js';
import { registerKnowledgeResources } from './resources.js';

export function registerMCPCommands(program: Command): void {
  program
    .command('mcp')
    .description('MCP server operations')
    .option('serve', 'Start MCP server')
    .option('--port <port>', 'HTTP port', '8080')
    .option('--stdio', 'Use stdio transport (for Claude Desktop)')
    .action(async (options: { port?: string; stdio?: boolean }) => {
      console.log(chalk.blue('Starting MCP server...'));
      
      const server = await createDefaultMCPServer(Number(options.port) || 8080);
      registerKnowledgeResources(server);
      
      if (options.stdio) {
        startStdioTransport(server);
        console.log(chalk.green('✓ MCP stdio transport ready'));
        console.log(chalk.dim('  Connect with: Claude Desktop, Cursor, Windsurf'));
      } else {
        await server.start();
        const stats = server.getStats();
        console.log(chalk.green(`✓ MCP HTTP server on port ${stats.port}`));
        console.log(chalk.dim(`  Capabilities: ${stats.capabilities}`));
        console.log(chalk.dim(`  Tools: ${stats.tools}`));
        console.log(chalk.dim(`  Resources: ${stats.resources}`));
      }
    });
}
