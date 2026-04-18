/**
 * rivet/transcript.ts — Universal transcript format for portable session logs
 * 
 * Features:
 * - Portable, replayable session logs
 * - Audit trail for compliance
 * - Export/import between Dirgha instances
 * 
 * Phase B: Developer experience (Rivet Agent-OS)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/** Transcript event types */
export type TranscriptEventType =
  | 'user_message'
  | 'agent_response'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system'
  | 'checkpoint'
  | 'file_change'
  | 'command';

/** Single transcript event */
export interface TranscriptEvent {
  /** Unique event ID */
  id: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Event type */
  type: TranscriptEventType;
  /** Actor (user, agent, system) */
  actor: string;
  /** Event content */
  content: unknown;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Parent event ID (for threading) */
  parentId?: string;
  /** Session context at this point */
  context?: {
    workingDir?: string;
    files?: string[];
    variables?: Record<string, unknown>;
  };
}

/** Complete session transcript */
export interface Transcript {
  /** Transcript format version */
  version: '1.0';
  /** Session ID */
  sessionId: string;
  /** Start time */
  startedAt: string;
  /** End time (null if ongoing) */
  endedAt?: string;
  /** Agent/system info */
  agent: {
    name: string;
    version: string;
    model?: string;
    capabilities: string[];
  };
  /** Environment snapshot */
  environment: {
    platform: string;
    shell: string;
    workingDir: string;
    /** Key env vars (sanitized) */
    env: Record<string, string>;
  };
  /** All events in order */
  events: TranscriptEvent[];
  /** Summary stats */
  stats: {
    messageCount: number;
    toolCallCount: number;
    tokenCount?: number;
    durationMs?: number;
  };
  /** Optional session tags */
  tags?: string[];
  /** Optional project association */
  project?: {
    id: string;
    name: string;
  };
}

/** Transcript builder */
export class TranscriptBuilder {
  private transcript: Transcript;
  private eventCounter = 0;

  constructor(sessionId: string, agentInfo: Transcript['agent']) {
    this.transcript = {
      version: '1.0',
      sessionId,
      startedAt: new Date().toISOString(),
      agent: agentInfo,
      environment: this.captureEnvironment(),
      events: [],
      stats: {
        messageCount: 0,
        toolCallCount: 0,
      },
    };
  }

  /** Add user message event */
  addUserMessage(content: string, metadata?: Record<string, unknown>): TranscriptEvent {
    this.transcript.stats.messageCount++;
    return this.addEvent('user_message', 'user', { text: content }, metadata);
  }

  /** Add agent response event */
  addAgentResponse(content: string, model?: string, metadata?: Record<string, unknown>): TranscriptEvent {
    this.transcript.stats.messageCount++;
    return this.addEvent('agent_response', 'agent', { text: content, model }, metadata);
  }

  /** Add tool call event */
  addToolCall(toolName: string, args: unknown, metadata?: Record<string, unknown>): TranscriptEvent {
    this.transcript.stats.toolCallCount++;
    return this.addEvent('tool_call', 'agent', { tool: toolName, args }, metadata);
  }

  /** Add tool result event */
  addToolResult(toolName: string, result: unknown, success: boolean, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('tool_result', 'system', { tool: toolName, result, success }, metadata);
  }

  /** Add error event */
  addError(error: Error | string, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('error', 'system', {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
    }, metadata);
  }

  /** Add system event */
  addSystem(message: string, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('system', 'system', { message }, metadata);
  }

  /** Add checkpoint event */
  addCheckpoint(checkpointId: string, description?: string, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('checkpoint', 'system', { checkpointId, description }, metadata);
  }

  /** Add file change event */
  addFileChange(path: string, operation: 'create' | 'modify' | 'delete', diff?: string, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('file_change', 'agent', { path, operation, diff }, metadata);
  }

  /** Add command execution event */
  addCommand(command: string, output?: string, exitCode?: number, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.addEvent('command', 'user', { command, output, exitCode }, metadata);
  }

  /** Set project association */
  setProject(projectId: string, projectName: string): void {
    this.transcript.project = { id: projectId, name: projectName };
  }

  /** Add tags */
  addTags(...tags: string[]): void {
    this.transcript.tags = [...(this.transcript.tags || []), ...tags];
  }

  /** Update stats */
  updateStats(stats: Partial<Transcript['stats']>): void {
    this.transcript.stats = { ...this.transcript.stats, ...stats };
  }

  /** Mark session as ended */
  end(): void {
    this.transcript.endedAt = new Date().toISOString();
    const start = new Date(this.transcript.startedAt).getTime();
    const end = new Date(this.transcript.endedAt).getTime();
    this.transcript.stats.durationMs = end - start;
  }

  /** Build final transcript */
  build(): Transcript {
    return { ...this.transcript };
  }

  /** Export to JSON */
  toJSON(): string {
    return JSON.stringify(this.transcript, null, 2);
  }

  /** Save to file */
  save(filepath?: string): string {
    const path = filepath || this.getDefaultPath();
    const dir = dirname(path);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, this.toJSON());
    return path;
  }

  private addEvent(
    type: TranscriptEventType,
    actor: string,
    content: unknown,
    metadata?: Record<string, unknown>
  ): TranscriptEvent {
    const event: TranscriptEvent = {
      id: `evt_${++this.eventCounter}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type,
      actor,
      content,
      metadata,
      context: {
        workingDir: process.cwd(),
        files: [], // Could scan current files
        variables: {}, // Could capture env vars
      },
    };

    this.transcript.events.push(event);
    return event;
  }

  private captureEnvironment(): Transcript['environment'] {
    const safeEnv: Record<string, string> = {};
    const allowedKeys = ['PATH', 'HOME', 'SHELL', 'TERM', 'USER', 'LANG', 'EDITOR'];
    
    for (const key of allowedKeys) {
      if (process.env[key]) {
        safeEnv[key] = process.env[key]!;
      }
    }

    return {
      platform: process.platform,
      shell: process.env.SHELL || 'unknown',
      workingDir: process.cwd(),
      env: safeEnv,
    };
  }

  private getDefaultPath(): string {
    const dir = join(homedir(), '.dirgha', 'transcripts');
    return join(dir, `${this.transcript.sessionId}.json`);
  }
}

/** Load transcript from file */
export function loadTranscript(filepath: string): Transcript {
  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as Transcript;
}

/** Replay transcript events (for debugging/audit) */
export async function replayTranscript(
  transcript: Transcript,
  callback?: (event: TranscriptEvent, index: number) => void | Promise<void>
): Promise<void> {
  for (let i = 0; i < transcript.events.length; i++) {
    const event = transcript.events[i];
    
    if (callback) {
      await callback(event, i);
    }
    
    // Small delay for visual replay
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Search transcripts */
export function searchTranscript(
  transcript: Transcript,
  query: string
): TranscriptEvent[] {
  const lowerQuery = query.toLowerCase();
  
  return transcript.events.filter(event => {
    const content = JSON.stringify(event.content).toLowerCase();
    return content.includes(lowerQuery);
  });
}

/** Export transcript as markdown (human-readable) */
export function exportAsMarkdown(transcript: Transcript): string {
  const lines: string[] = [
    `# Session Transcript: ${transcript.sessionId}`,
    '',
    `**Started:** ${transcript.startedAt}`,
    `**Agent:** ${transcript.agent.name} v${transcript.agent.version}`,
    `**Model:** ${transcript.agent.model || 'unknown'}`,
    '',
    '---',
    '',
  ];

  for (const event of transcript.events) {
    const time = new Date(event.timestamp).toLocaleTimeString();
    
    switch (event.type) {
      case 'user_message':
        lines.push(`### [${time}] User`);
        lines.push('');
        lines.push((event.content as { text: string }).text);
        lines.push('');
        break;
        
      case 'agent_response':
        lines.push(`### [${time}] Agent`);
        lines.push('');
        lines.push((event.content as { text: string }).text);
        lines.push('');
        break;
        
      case 'tool_call':
        lines.push(`#### [${time}] Tool Call: ${(event.content as { tool: string }).tool}`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify((event.content as { args: unknown }).args, null, 2));
        lines.push('```');
        lines.push('');
        break;
        
      case 'error':
        lines.push(`#### [${time}] ⚠️ Error`);
        lines.push('');
        lines.push((event.content as { message: string }).message);
        lines.push('');
        break;
        
      case 'checkpoint':
        lines.push(`#### [${time}] 💾 Checkpoint: ${(event.content as { checkpointId: string }).checkpointId}`);
        lines.push('');
        break;
    }
  }

  return lines.join('\n');
}

/** Merge multiple transcripts */
export function mergeTranscripts(transcripts: Transcript[]): Transcript {
  if (transcripts.length === 0) {
    throw new Error('Cannot merge empty array');
  }

  const merged: Transcript = {
    version: '1.0',
    sessionId: `merged_${Date.now()}`,
    startedAt: transcripts[0].startedAt,
    endedAt: transcripts[transcripts.length - 1].endedAt,
    agent: transcripts[0].agent,
    environment: transcripts[0].environment,
    events: [],
    stats: {
      messageCount: 0,
      toolCallCount: 0,
    },
    tags: [],
  };

  for (const t of transcripts) {
    merged.events.push(...t.events);
    merged.stats.messageCount += t.stats.messageCount;
    merged.stats.toolCallCount += t.stats.toolCallCount;
    if (t.tags) {
      merged.tags = [...(merged.tags || []), ...t.tags];
    }
  }

  // Sort by timestamp
  merged.events.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return merged;
}
