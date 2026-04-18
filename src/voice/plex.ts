/**
 * voice/plex.ts — Personal Plex two-way voice
 */
import { EventEmitter } from 'events';
import type { VoiceConfig, RecordingSession } from './types.js';
import { VoiceRecorder } from './recorder.js';
import { transcribe } from './transcribe.js';

export class PersonalPlex extends EventEmitter {
  private recorder = new VoiceRecorder();
  private config: VoiceConfig;
  private conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(config: VoiceConfig) {
    super();
    this.config = config;
    
    this.recorder.on('status', (s) => this.emit('status', s));
    this.recorder.on('visual', (v) => this.emit('visual', v));
  }

  async wake(): Promise<void> {
    this.emit('visual', '🤖');
    this.emit('message', 'Plex is ready. Speak naturally.');
  }

  async startRecording(): Promise<string> {
    return this.recorder.start();
  }

  async stopRecording(): Promise<string> {
    const session = this.recorder.stop();
    if (!session) return '';

    // Transcribe
    this.emit('status', 'transcribing');
    // In real implementation: save audio to temp file
    const result = transcribe('/tmp/recording.wav', this.config.sttModel);
    
    this.conversation.push({ role: 'user', content: result.text });
    this.emit('transcript', result.text);

    // Get LLM response
    this.emit('status', 'thinking');
    const response = await this.getLLMResponse(result.text);
    this.conversation.push({ role: 'assistant', content: response });
    
    this.emit('response', response);
    this.emit('visual', this.config.autoPlex ? '🤖' : '🎤');

    // TTS if enabled
    if (this.config.ttsVoice !== 'none') {
      this.emit('status', 'speaking');
      // In real implementation: piper TTS
    }

    return response;
  }

  private async getLLMResponse(input: string): Promise<string> {
    // In real implementation: call local LLM or cloud
    return `[Plex] Processing: "${input}"`;
  }

  getConversation() {
    return [...this.conversation];
  }
}
