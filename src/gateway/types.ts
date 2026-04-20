import { StreamEvent } from '../tui/components/stream/types.js';

export interface GatewayMessage {
  text: string;
  senderId: string;
  platform: 'telegram' | 'discord' | 'slack' | 'web';
  metadata?: Record<string, any>;
}

export interface GatewayAdapter {
  name: string;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  sendStreamEvent?: (chatId: string, event: StreamEvent) => Promise<void>;
  onMessage: (handler: (msg: GatewayMessage) => Promise<void>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}
