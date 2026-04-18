// @ts-nocheck
/**
 * connect.ts
 * CLI command to establish tunnel into gateway
 * Usage: dirgha connect [gateway-url]
 */
import { intro, outro, text, spinner, note } from '@clack/prompts';
import color from 'picocolors';
import { getAuthToken, getConfig } from '../utils/config';
import WebSocket from 'ws';

interface ConnectOptions {
  gateway?: string;
  repl?: boolean;
}

export async function connect(options: ConnectOptions = {}) {
  intro(color.bgCyan(' dirgha connect '));
  
  const gatewayUrl = options.gateway || getConfig().gatewayUrl || 'https://api.dirgha.org';
  
  // Check auth
  const token = getAuthToken();
  if (!token) {
    outro(color.red('Not authenticated. Run `dirgha login` first.'));
    process.exit(1);
  }
  
  const s = spinner();
  s.start('Requesting tunnel token...');
  
  try {
    // Request tunnel token from gateway
    const res = await fetch(`${gatewayUrl}/api/unified/cli-bridge/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      throw new Error(`Failed to get tunnel token: ${res.status}`);
    }
    
    const data = await res.json();
    s.stop('Tunnel token acquired');
    
    // Show connection info
    note(
      `Connected as: ${data.user.email}\n` +
      `Tier: ${data.user.tier}\n` +
      `Available modules: ${data.user.modules.join(', ')}`,
      'Gateway Connection'
    );
    
    // Establish WebSocket connection
    if (options.repl !== false) {
      await startRepl(data.wsUrl, data.token, data.user);
    }
    
    outro(color.green('Connection established. Use Ctrl+C to exit.'));
    
  } catch (err) {
    s.stop('Failed');
    outro(color.red(err instanceof Error ? err.message : 'Connection failed'));
    process.exit(1);
  }
}

// Interactive REPL over WebSocket
async function startRepl(wsUrl: string, token: string, user: any) {
  const ws = new WebSocket(wsUrl, [], {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log(color.dim('\nConnected to gateway. Type commands or "help" for available commands.\n'));
      
      // Setup readline for user input
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: color.cyan('dirgha> '),
      });
      
      rl.prompt();
      
      rl.on('line', (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) {
          rl.prompt();
          return;
        }
        
        if (trimmed === 'help') {
          console.log(color.dim(`
Available commands:
  status          - Check gateway connection status
  modules         - List your enabled modules
  projects        - List recent projects
  query <type>    - Query gateway data
  ping            - Test connection latency
  exit            - Disconnect from gateway
`));
          rl.prompt();
          return;
        }
        
        if (trimmed === 'exit' || trimmed === 'quit') {
          ws.close();
          rl.close();
          resolve();
          return;
        }
        
        // Send command to gateway
        const [command, ...args] = trimmed.split(' ');
        ws.send(JSON.stringify({
          type: 'command',
          id: Math.random().toString(36).slice(2),
          command,
          args,
        }));
      });
      
      rl.on('close', () => {
        ws.close();
        resolve();
      });
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        switch (msg.type) {
          case 'connected':
            console.log(color.green(`✓ ${msg.message}`));
            break;
            
          case 'command_result':
            console.log(color.dim('Result:'));
            console.log(JSON.stringify(msg.result, null, 2));
            process.stdout.write(color.cyan('dirgha> '));
            break;
            
          case 'query_result':
            console.log(color.dim('Query result:'));
            console.log(JSON.stringify(msg.result, null, 2));
            process.stdout.write(color.cyan('dirgha> '));
            break;
            
          case 'pong':
            const latency = Date.now() - msg.timestamp;
            console.log(color.dim(`Latency: ${latency}ms`));
            process.stdout.write(color.cyan('dirgha> '));
            break;
            
          case 'error':
            console.log(color.red(`Error: ${msg.message}`));
            process.stdout.write(color.cyan('dirgha> '));
            break;
            
          default:
            console.log(color.dim(JSON.stringify(msg)));
        }
      } catch {
        console.log(data.toString());
      }
    });
    
    ws.on('error', (err) => {
      console.error(color.red(`WebSocket error: ${err.message}`));
      reject(err);
    });
    
    ws.on('close', () => {
      console.log(color.dim('\nDisconnected from gateway.'));
      resolve();
    });
  });
}

export default connect;
