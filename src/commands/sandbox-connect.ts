import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readConfig } from '../utils/config.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerSandboxConnectCommand(program: Command): void {
  program
    .command('connect sandbox <urlOrId>')
    .description('Connect to a Dirgha sandbox and open an interactive REPL')
    .action(async (urlOrId: string) => {
      try {
        // 1. Derive URL and ID
        let id: string;
        let url: string;

        if (urlOrId.startsWith('http')) {
          url = urlOrId.replace(/\/$/, '');
          const match = url.match(/https?:\/\/([^.]+)\.e2b\.app/);
          id = match ? match[1] : new URL(url).hostname;
        } else {
          id = urlOrId;
          url = `https://${id}.e2b.app`;
        }

        const mcpEndpoint = `${url}/mcp`;

        // 2. Test connectivity
        let isHealthy = false;
        try {
          const healthRes = await fetch(`${mcpEndpoint}/health`);
          if (healthRes.ok) isHealthy = true;
        } catch {
          try {
            const toolsRes = await fetch(`${mcpEndpoint}/tools`);
            if (toolsRes.ok) isHealthy = true;
          } catch {
            isHealthy = false;
          }
        }

        if (!isHealthy) {
          console.log(chalk.yellow('Warning: Could not verify sandbox connectivity. Proceeding anyway...'));
        }

        // 3. Print connection info and tools table
        console.log(chalk.green(`\nConnected to sandbox ${chalk.bold(id)} at ${url}`));
        console.log(chalk.dim(`MCP Endpoint: ${mcpEndpoint}\n`));
        
        console.log(chalk.bold('Available MCP Tools:'));
        console.log('┌─────────────┬──────────────────────────────────┐');
        console.log('│ Tool        │ Description                      │');
        console.log('├─────────────┼──────────────────────────────────┤');
        console.log('│ read_file   │ Read a file from the sandbox     │');
        console.log('│ write_file  │ Write content to a file          │');
        console.log('│ run_command │ Execute a shell command          │');
        console.log('│ get_logs    │ Get running process output       │');
        console.log('│ restart     │ Restart the dev server           │');
        console.log('└─────────────┴──────────────────────────────────┘');

        // 4. Save connection
        const configDir = path.join(os.homedir(), '.dirgha');
        await fs.mkdir(configDir, { recursive: true });
        const connectionsFile = path.join(configDir, 'sandbox-connections.json');
        
        let connections: Array<{ id: string; url: string; mcpEndpoint: string; connectedAt: string }> = [];
        try {
          const data = await fs.readFile(connectionsFile, 'utf-8');
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) connections = parsed;
        } catch {
          // File doesn't exist or is invalid, start fresh
        }

        const connectionRecord = {
          id,
          url,
          mcpEndpoint,
          connectedAt: new Date().toISOString()
        };

        // Update existing or add new
        const existingIndex = connections.findIndex(c => c.id === id);
        if (existingIndex >= 0) {
          connections[existingIndex] = connectionRecord;
        } else {
          connections.push(connectionRecord);
        }

        await fs.writeFile(connectionsFile, JSON.stringify(connections, null, 2));
        console.log(chalk.dim(`\nConnection saved to ${connectionsFile}`));

        // 5. Interactive REPL
        console.log(chalk.cyan('\nEntering interactive REPL. Type "exit" or "quit" to disconnect.\n'));
        
        const rl = readline.createInterface({ input, output });

        const callMcpTool = async (toolName: string, args: Record<string, any>) => {
          const res = await fetch(`${mcpEndpoint}/tools/${toolName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arguments: args })
          });
          
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          
          const result = await res.json() as any;
          if (result.error) {
            console.log(chalk.red(result.error));
          } else if (result.content?.[0]?.text) {
            console.log(result.content[0].text);
          } else {
            console.log(result);
          }
        };

        while (true) {
          const line = await rl.question('sandbox> ');
          const trimmed = line.trim();
          if (!trimmed) continue;

          const [command, ...rest] = trimmed.split(' ');

          try {
            if (command === 'exit' || command === 'quit') {
              break;
            } else if (command === 'run') {
              const cmdStr = rest.join(' ');
              if (!cmdStr) {
                console.log(chalk.red('Usage: run <command>'));
                continue;
              }
              await callMcpTool('run_command', { command: cmdStr });
            } else if (command === 'read') {
              const filePath = rest.join(' ');
              if (!filePath) {
                console.log(chalk.red('Usage: read <path>'));
                continue;
              }
              await callMcpTool('read_file', { path: filePath });
            } else if (command === 'write') {
              if (rest.length < 2) {
                console.log(chalk.red('Usage: write <path> <content>'));
                continue;
              }
              const filePath = rest[0];
              const content = rest.slice(1).join(' ');
              await callMcpTool('write_file', { path: filePath, content });
            } else if (command === 'logs') {
              await callMcpTool('get_logs', {});
            } else if (command === 'restart') {
              await callMcpTool('restart', {});
            } else {
              console.log(chalk.yellow(`Unknown command: ${command}`));
            }
          } catch (err) {
            console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
          }
        }

        rl.close();
        console.log(chalk.green('\nDisconnected from sandbox.'));

      } catch (error) {
        console.error(chalk.red(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}
