/**
 * rivet/transcript.test.ts — Tests for universal transcript format
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TranscriptBuilder,
  loadTranscript,
  replayTranscript,
  exportAsMarkdown,
  mergeTranscripts,
} from './transcript.js';

const testDir = join(tmpdir(), 'dirgha-rivet-test');

describe('TranscriptBuilder', () => {
  let builder: TranscriptBuilder;

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    builder = new TranscriptBuilder('test-session', {
      name: 'Dirgha',
      version: '0.2.0',
      capabilities: ['code', 'chat', 'tools'],
    });
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch {}
  });

  it('creates a transcript with correct structure', () => {
    const transcript = builder.build();

    expect(transcript.version).toBe('1.0');
    expect(transcript.sessionId).toBe('test-session');
    expect(transcript.agent.name).toBe('Dirgha');
    expect(transcript.agent.version).toBe('0.2.0');
    expect(transcript.events).toHaveLength(0);
    expect(transcript.stats.messageCount).toBe(0);
  });

  it('adds user messages', () => {
    builder.addUserMessage('Hello, can you help me?');
    const transcript = builder.build();

    expect(transcript.events).toHaveLength(1);
    expect(transcript.events[0].type).toBe('user_message');
    expect(transcript.events[0].actor).toBe('user');
    expect(transcript.stats.messageCount).toBe(1);
  });

  it('adds agent responses', () => {
    builder.addAgentResponse('Yes, I can help!', 'gpt-4');
    const transcript = builder.build();

    expect(transcript.events).toHaveLength(2);
    expect(transcript.events[1].type).toBe('agent_response');
    expect(transcript.events[1].actor).toBe('agent');
  });

  it('adds tool calls', () => {
    builder.addToolCall('read_file', { path: 'test.txt' });
    const transcript = builder.build();

    expect(transcript.events).toHaveLength(3);
    expect(transcript.events[2].type).toBe('tool_call');
    expect(transcript.stats.toolCallCount).toBe(1);
  });

  it('adds errors', () => {
    builder.addError(new Error('Something went wrong'));
    const transcript = builder.build();

    expect(transcript.events).toHaveLength(4);
    expect(transcript.events[3].type).toBe('error');
  });

  it('saves and loads transcript', () => {
    const filepath = join(testDir, 'test-transcript.json');
    builder.addTags('test', 'demo');
    builder.end();
    builder.save(filepath);

    expect(existsSync(filepath)).toBe(true);

    const loaded = loadTranscript(filepath);
    expect(loaded.sessionId).toBe('test-session');
    expect(loaded.tags).toContain('test');
    expect(loaded.endedAt).toBeDefined();
  });

  it('exports as markdown', () => {
    const markdown = exportAsMarkdown(builder.build());

    expect(markdown).toContain('# Session Transcript');
    expect(markdown).toContain('test-session');
    expect(markdown).toContain('Dirgha');
  });
});

describe('replayTranscript', () => {
  it('replays events in order', async () => {
    const builder = new TranscriptBuilder('replay-test', {
      name: 'Test',
      version: '1.0',
      capabilities: [],
    });

    builder.addUserMessage('First');
    builder.addAgentResponse('Second');
    builder.addUserMessage('Third');

    const events: string[] = [];
    await replayTranscript(builder.build(), (event) => {
      events.push(event.type);
    });

    expect(events).toEqual(['user_message', 'agent_response', 'user_message']);
  });
});

describe('mergeTranscripts', () => {
  it('merges multiple transcripts', () => {
    const t1 = new TranscriptBuilder('t1', { name: 'A', version: '1', capabilities: [] });
    t1.addUserMessage('Message 1');

    const t2 = new TranscriptBuilder('t2', { name: 'B', version: '1', capabilities: [] });
    t2.addUserMessage('Message 2');

    const merged = mergeTranscripts([t1.build(), t2.build()]);

    expect(merged.events).toHaveLength(2);
    expect(merged.stats.messageCount).toBe(2);
  });
});
