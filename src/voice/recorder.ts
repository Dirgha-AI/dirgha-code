/**
 * voice/recorder.ts — Desktop voice recorder
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import type { RecordingSession } from './types.js';

export class VoiceRecorder extends EventEmitter {
  private session?: RecordingSession;
  private process?: ReturnType<typeof spawn>;

  start(): string {
    const id = `rec-${Date.now()}`;
    this.session = {
      id,
      status: 'recording',
      audioBuffer: [],
      transcript: '',
      response: '',
      startedAt: new Date()
    };

    // In real implementation: spawn sox/arecord
    this.emit('status', 'recording');
    this.emit('visual', '🔴');

    return id;
  }

  stop(): RecordingSession | null {
    if (!this.session) return null;

    this.session.status = 'processing';
    this.session.endedAt = new Date();
    this.emit('status', 'processing');
    this.emit('visual', '⏳');

    const session = { ...this.session };
    this.session = undefined;
    return session;
  }

  cancel(): void {
    if (this.process) {
      this.process.kill();
    }
    this.session = undefined;
    this.emit('status', 'idle');
    this.emit('visual', '🎤');
  }

  getStatus(): string {
    return this.session?.status || 'idle';
  }
}
