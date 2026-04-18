/**
 * mcp/client.ts — Model Context Protocol client
 * Allows the CLI to connect to external MCP servers (HTTP or Stdio)
 */
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import type { MCPContextRequest, MCPContextResponse, MCPTool } from './server.js';

export interface MCPClientOptions {
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export class MCPClient extends EventEmitter {
  private options: MCPClientOptions;
  private child: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, { resolve: (v: any) => void, reject: (e: any) => void }>();
  private tools: MCPTool[] = [];

  constructor(options: MCPClientOptions) {
    super();
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.options.type === 'stdio') {
      return this.connectStdio();
    } else {
      return this.connectHttp();
    }
  }

  private async connectStdio(): Promise<void> {
    const { command, args, env } = this.options;
    if (!command) throw new Error(`Command required for stdio transport: ${this.options.name}`);

    this.child = spawn(command, args || [], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = readline.createInterface({
      input: this.child.stdout!,
      terminal: false
    });

    rl.on('line', (line) => {
      try {
        const response: MCPContextResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          if (response.error) pending.reject(new Error(response.error.message));
          else pending.resolve(response.result);
          this.pendingRequests.delete(response.id);
        }
      } catch (err) {
        // Ignore non-json or partial lines
      }
    });

    this.child.stderr?.on('data', (data) => {
      // Log server errors to debug
      // process.stderr.write(`[${this.options.name}] ${data}`);
    });

    this.child.on('exit', (code) => {
      this.emit('disconnected', { code });
    });

    // Wait for server to be ready (some servers print a ready message)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async connectHttp(): Promise<void> {
    if (!this.options.url) throw new Error(`URL required for http transport: ${this.options.name}`);
    // HTTP is stateless, just verify health
    const res = await this.request('health', {});
    if (!res) throw new Error(`MCP server at ${this.options.url} not responding`);
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.request('tools/list', {});
    this.tools = (result as any)?.tools || [];
    return this.tools;
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.request('tools/call', { name, arguments: args });
  }

  private async request(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    const request: MCPContextRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    if (this.options.type === 'stdio') {
      if (!this.child?.stdin) throw new Error('Not connected');
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        this.child!.stdin!.write(JSON.stringify(request) + '\n');
      });
    } else {
      const res = await fetch(this.options.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const data: MCPContextResponse = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }
  }

  async disconnect(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}
