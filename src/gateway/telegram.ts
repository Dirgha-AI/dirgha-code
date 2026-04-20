import { GatewayAdapter, GatewayMessage } from './types.js';
import { StreamEvent } from '../tui/components/stream/types.js';
import { logger } from '../utils/logger.js';

export class TelegramAdapter implements GatewayAdapter {
  name = 'telegram';
  private token: string | undefined;
  private handler?: (msg: GatewayMessage) => Promise<void>;

  constructor() {
    this.token = process.env['TELEGRAM_BOT_TOKEN'];
  }

  async start() {
    if (!this.token) {
      logger.warn('Telegram token missing, skipping startup');
      return;
    }
    logger.info('Telegram gateway started');
    // In a real implementation, we'd start the long-polling loop here.
  }

  async stop() {
    logger.info('Telegram gateway stopped');
  }

  onMessage(handler: (msg: GatewayMessage) => Promise<void>) {
    this.handler = handler;
  }

  async sendMessage(chatId: string, text: string) {
    if (!this.token) return;
    logger.debug('Sending TG message', { chatId, textLen: text.length });
    // Implementation: fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, ...)
  }

  async sendStreamEvent(chatId: string, event: StreamEvent) {
    if (event.type === 'text' && event.content) {
      // For TG, we might only send complete paragraphs or status updates
    }
  }
}
