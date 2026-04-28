import { describe, expect, it } from 'vitest';
import { createEventStream } from '../event-stream.js';
import type { AgentEvent } from '../types.js';

describe('createEventStream', () => {
  it('delivers events to subscribers in order', async () => {
    const stream = createEventStream();
    const seen: AgentEvent[] = [];
    stream.subscribe(ev => { seen.push(ev); });
    stream.emit({ type: 'agent_start', sessionId: 's1', model: 'm' });
    stream.emit({ type: 'text_delta', delta: 'hi' });
    stream.emit({ type: 'agent_end', sessionId: 's1', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 } });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(seen.map(e => e.type)).toEqual(['agent_start', 'text_delta', 'agent_end']);
  });

  it('supports async iteration with multiple independent iterators', async () => {
    const stream = createEventStream();
    const a = stream.iterator();
    const b = stream.iterator();

    stream.emit({ type: 'text_delta', delta: 'a' });
    stream.emit({ type: 'text_delta', delta: 'b' });
    stream.close();

    const aEvents: AgentEvent[] = [];
    const bEvents: AgentEvent[] = [];
    for await (const ev of a) aEvents.push(ev);
    for await (const ev of b) bEvents.push(ev);

    expect(aEvents.length).toBe(2);
    expect(bEvents.length).toBe(2);
  });

  it('unsubscribes cleanly', async () => {
    const stream = createEventStream();
    const seen: AgentEvent[] = [];
    const unsubscribe = stream.subscribe(ev => { seen.push(ev); });
    stream.emit({ type: 'text_delta', delta: 'first' });
    await new Promise(resolve => setTimeout(resolve, 5));
    unsubscribe();
    stream.emit({ type: 'text_delta', delta: 'second' });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(seen).toHaveLength(1);
  });
});
