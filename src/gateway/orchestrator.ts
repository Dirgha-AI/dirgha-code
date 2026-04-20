import { GatewayAdapter } from './types.js';
import { TaskQueue } from '../tui/TaskQueue.js';
import { runAgentLoop } from '../agent/loop.js';
import { logger } from '../utils/logger.js';

export class HeadlessOrchestrator {
  private queue: TaskQueue;

  constructor(private adapter: GatewayAdapter) {
    this.queue = new TaskQueue(
      (task) => this.processTask(task),
      () => {} // No-op status updates in headless mode
    );
  }

  async start() {
    this.adapter.onMessage(async (msg) => {
      logger.info('Gateway received message', { from: msg.senderId });
      this.queue.enqueue(msg.text, { metadata: { chatId: msg.senderId } });
    });
    await this.adapter.start();
  }

  private async processTask(task: any) {
    const chatId = task.metadata?.chatId;
    if (!chatId) return;

    try {
      const result = await runAgentLoop(
        task.prompt,
        [], // Empty history for new gateway turns for now
        'auto',
        (text) => this.adapter.sendStreamEvent?.(chatId, { type: 'text', content: text }),
        (name) => this.adapter.sendMessage(chatId, `◈ Running ${name}...`),
        undefined // Context would be loaded from DB in production
      );

      const final = result.messages[result.messages.length - 1]?.content;
      if (typeof final === 'string') {
        await this.adapter.sendMessage(chatId, final);
      }
    } catch (err: any) {
      await this.adapter.sendMessage(chatId, `✗ Error: ${err.message}`);
    }
  }
}
