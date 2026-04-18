// @ts-nocheck
/**
 * voice/browser-extension.ts — Browser extension bridge for CLI
 * 
 * Companion browser extension captures voice and sends to CLI
 * via native messaging or WebSocket.
 */
import type { TranscriptionResult, STTOptions } from './types.js';

export interface BrowserExtensionMessage {
  type: 'transcript' | 'ping' | 'ready';
  text?: string;
  confidence?: number;
  language?: string;
}

export class BrowserExtensionBridge {
  private port: any = null;
  private onTranscript: ((text: string) => void) | null = null;

  async connect(): Promise<boolean> {
    // Try native messaging (Chrome/Firefox extension)
    try {
      // @ts-ignore - Chrome API
      if (typeof chrome !== 'undefined' && chrome.runtime?.connectNative) {
        // @ts-ignore
        this.port = chrome.runtime.connectNative('ai.dirgha.voice');
        this.setupListeners();
        return true;
      }
    } catch {
      // Extension not installed
    }

    // Fallback: WebSocket to local server
    try {
      this.port = new WebSocket('ws://localhost:3778');
      this.setupWebSocketListeners();
      return new Promise((resolve) => {
        this.port!.onopen = () => resolve(true);
        this.port!.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  private setupListeners(): void {
    if (!this.port) return;

    this.port.onMessage.addListener((msg: BrowserExtensionMessage) => {
      if (msg.type === 'transcript' && msg.text) {
        this.onTranscript?.(msg.text);
      }
    });

    this.port.onDisconnect.addListener(() => {
      console.log('[Voice Extension] Disconnected');
      this.port = null;
    });
  }

  private setupWebSocketListeners(): void {
    if (!this.port) return;

    this.port.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as BrowserExtensionMessage;
      if (msg.type === 'transcript' && msg.text) {
        this.onTranscript?.(msg.text);
      }
    };
  }

  onTranscriptReceived(callback: (text: string) => void): void {
    this.onTranscript = callback;
  }

  async startRecording(): Promise<void> {
    this.sendMessage({ type: 'ping' }); // Wake up extension
    this.sendMessage({ type: 'ready' }); // Request recording start
  }

  stopRecording(): void {
    this.port?.disconnect?.();
    this.port?.close?.();
  }

  private sendMessage(msg: BrowserExtensionMessage): void {
    if (this.port?.postMessage) {
      this.port.postMessage(msg);
    } else if (this.port?.send) {
      this.port.send(JSON.stringify(msg));
    }
  }

  isConnected(): boolean {
    return this.port !== null;
  }
}

// Extension manifest.json
export const EXTENSION_MANIFEST = {
  manifest_version: 3,
  name: 'Dirgha Voice',
  version: '1.0.0',
  description: 'Voice typing for Dirgha CLI',
  permissions: ['activeTab', 'microphone'],
  host_permissions: ['http://localhost:3778/*'],
  background: {
    service_worker: 'background.js'
  },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['content.js']
  }],
  web_accessible_resources: [{
    resources: ['recorder.html'],
    matches: ['<all_urls>']
  }]
};
