/**
 * agent/pending-messages.ts — FIFO queue for user messages submitted while the
 * agent loop is mid-work. The REPL's input box calls push() the instant the
 * user hits Enter, without waiting for the current turn to finish. The agent
 * loop calls drain() right before every LLM call, injecting the drained
 * messages as fresh user turns so the model sees them immediately.
 *
 * This is what makes "type while the agent is working" feel instant: the next
 * turn, typically <2s away, will include your message. Not queued for later —
 * processed on the very next model call.
 *
 * ESC (via AbortSignal in loop.ts) cancels the in-flight tool/LLM call, at
 * which point the next iteration picks up any drained messages.
 */
import { EventEmitter } from 'node:events';
import type { Message } from '../types.js';

class PendingUserMessageQueue extends EventEmitter {
  private buffer: Message[] = [];

  /** REPL/Ink input calls this when the user submits text. Non-blocking. */
  push(text: string): void {
    const trimmed = text?.trim();
    if (!trimmed) return;
    this.buffer.push({ role: 'user', content: trimmed });
    this.emit('message', trimmed);
  }

  /** Agent loop calls this right before each LLM call. Returns and clears. */
  drain(): Message[] {
    if (this.buffer.length === 0) return [];
    const out = this.buffer;
    this.buffer = [];
    return out;
  }

  /** Read without clearing — for UI status ("N messages pending"). */
  peek(): Message[] {
    return [...this.buffer];
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

const queue = new PendingUserMessageQueue();

export function getPendingUserMessages(): PendingUserMessageQueue {
  return queue;
}

/** Shorthand for REPL input handler. */
export function pushPendingUserMessage(text: string): void {
  queue.push(text);
}

/** Shorthand for agent loop. */
export function drainPendingUserMessages(): Message[] {
  return queue.drain();
}
