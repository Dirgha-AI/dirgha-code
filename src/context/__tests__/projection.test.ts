import { describe, it, expect } from 'vitest';
import { ConversationProjection } from '../projection.js';
import type { SessionEntry } from '../session.js';
import type { Message, UsageTotal } from '../../kernel/types.js';

function makeMsg(ts: string, role: string, content: string): SessionEntry {
  return {
    type: 'message',
    ts,
    message: { role: role as Message['role'], content },
  };
}

function makeCompaction(ts: string, keptFrom: string): SessionEntry {
  return {
    type: 'compaction',
    ts,
    keptFrom,
    summary: '',
  };
}

function makeTitle(ts: string, title: string): SessionEntry {
  return {
    type: 'title',
    ts,
    title,
  };
}

function makeUsage(ts: string, inTokens: number, outTokens: number): SessionEntry {
  return {
    type: 'usage',
    ts,
    usage: {
      inputTokens: inTokens,
      outputTokens: outTokens,
      cachedTokens: 0,
      costUsd: 0,
    },
  };
}

describe('ConversationProjection', () => {
  it('empty_projection — new projection has 0 messages, null title, zero usage', () => {
    const proj = new ConversationProjection();
    expect(proj.getMessages()).toHaveLength(0);
    expect(proj.getTitle()).toBeNull();
    expect(proj.getUsage()).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('apply_message_appends — apply 3 message entries with increasing ts; getMessages() returns all 3 in order', () => {
    const proj = new ConversationProjection();
    proj.apply(makeMsg('t1', 'user', 'hello'));
    proj.apply(makeMsg('t2', 'assistant', 'hi'));
    proj.apply(makeMsg('t3', 'user', 'how are you?'));

    const msgs = proj.getMessages();
    expect(msgs).toHaveLength(3);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('hi');
    expect(msgs[2].role).toBe('user');
    expect(msgs[2].content).toBe('how are you?');
  });

  it('apply_title — apply a title entry; getTitle() returns that title', () => {
    const proj = new ConversationProjection();
    proj.apply(makeTitle('t1', 'My Session'));
    expect(proj.getTitle()).toBe('My Session');
  });

  it('apply_usage_accumulates — apply two usage entries; getUsage() shows the sum of input/output tokens', () => {
    const proj = new ConversationProjection();
    proj.apply(makeUsage('t1', 10, 20));
    proj.apply(makeUsage('t2', 30, 40));
    expect(proj.getUsage()).toMatchObject({ inputTokens: 40, outputTokens: 60 });
  });

  it('apply_compaction_filters_messages — apply m1@t1, m2@t2, compaction@t3 (keptFrom=t3), m4@t4. getMessages() returns only m4', () => {
    const proj = new ConversationProjection();
    proj.apply(makeMsg('t1', 'user', 'm1'));
    proj.apply(makeMsg('t2', 'user', 'm2'));
    proj.apply(makeCompaction('t3', 't3'));
    proj.apply(makeMsg('t4', 'user', 'm4'));

    expect(proj.getMessages()).toHaveLength(1);
    expect(proj.getMessages()[0].content).toBe('m4');
    expect(proj.getCompactionThreshold()).toBe('t3');
  });

  it('replayFrom_async_iterable — feed a small array of entries via an async generator; verify projection state matches T05', async () => {
    async function* gen(): AsyncIterable<SessionEntry> {
      yield makeMsg('t1', 'user', 'm1');
      yield makeMsg('t2', 'user', 'm2');
      yield makeCompaction('t3', 't3');
      yield makeMsg('t4', 'user', 'm4');
    }

    const proj = new ConversationProjection();
    await proj.replayFrom(gen());
    expect(proj.getMessages()).toHaveLength(1);
    expect(proj.getMessages()[0].content).toBe('m4');
    expect(proj.getCompactionThreshold()).toBe('t3');
  });

  it('getEntries_returns_copy — getEntries() returns a copy: mutating the returned array does not affect subsequent getEntries() calls', () => {
    const proj = new ConversationProjection();
    proj.apply(makeMsg('t1', 'user', 'test'));
    const first = proj.getEntries();
    const second = proj.getEntries();
    expect(first).toEqual(second);
    first.push(makeMsg('t2', 'assistant', 'extra'));
    const third = proj.getEntries();
    expect(third).not.toEqual(first);
    expect(third).toEqual(second);
  });

  it('rawMessageCount_vs_visible — after compaction, rawMessageCount() includes pre-compaction messages, visibleMessageCount() does not', () => {
    const proj = new ConversationProjection();
    proj.apply(makeMsg('t1', 'user', 'm1'));
    proj.apply(makeMsg('t2', 'user', 'm2'));
    proj.apply(makeCompaction('t3', 't3'));
    proj.apply(makeMsg('t4', 'user', 'm3'));

    expect(proj.rawMessageCount()).toBe(3); // m1, m2, m3 (pre-compaction included)
    expect(proj.visibleMessageCount()).toBe(1); // only m3
  });
});
