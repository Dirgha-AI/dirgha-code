/**
 * browser/ipc-client.ts — WebSocket client for browser IPC
 */
export type BrowserCommand = 'NAVIGATE' | 'CLIP' | 'CHAT' | 'GET_URL' | 'GET_TITLE' | 'SCREENSHOT';

export interface IPCMessage {
  id: string;
  cmd: BrowserCommand;
  args?: Record<string, unknown>;
}

export interface IPCResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Lazy-load WebSocket to avoid hard dependency
let WebSocketCtor: any = null;
async function getWebSocket(): Promise<any> {
  if (!WebSocketCtor) {
    const ws = await import('ws');
    WebSocketCtor = ws.WebSocket;
  }
  return WebSocketCtor;
}

export class BrowserIPCClient {
  private ws: any = null;
  private handlers: ((msg: IPCResponse) => void)[] = [];
  private pending = new Map<string, (res: IPCResponse) => void>();

  async connect(port = 9876): Promise<void> {
    const WS = await getWebSocket();
    return new Promise((resolve, reject) => {
      this.ws = new WS(`ws://localhost:${port}`);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (e: Error) => reject(e));
      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as IPCResponse;
          this.handlers.forEach((h) => h(msg));
          const pending = this.pending.get(msg.id);
          if (pending) { pending(msg); this.pending.delete(msg.id); }
        } catch { }
      });
    });
  }

  onMessage(handler: (msg: IPCResponse) => void): void {
    this.handlers.push(handler);
  }

  async sendCommand(cmd: BrowserCommand, args?: Record<string, unknown>): Promise<IPCResponse> {
    if (!this.ws || this.ws.readyState !== 1) { // OPEN = 1
      throw new Error('Not connected to browser');
    }
    const id = `${Date.now()}-${Math.random()}`;
    const msg: IPCMessage = { id, cmd, args };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('IPC timeout')), 30000);
      this.pending.set(id, (res) => { clearTimeout(timeout); resolve(res); });
      this.ws.send(JSON.stringify(msg));
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.handlers = [];
    this.pending.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === 1;
  }
}

export const ipcClient = new BrowserIPCClient();
