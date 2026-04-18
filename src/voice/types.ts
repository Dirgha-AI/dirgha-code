/**
 * voice/types.ts — Voice CLI types
 */
export interface VoiceConfig {
  sttModel: 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'whisper-large';
  llmModel: 'gemma-2b' | 'gemma-4b' | 'gemma-26b' | 'gemma-31b' | 'cloud';
  ttsVoice: 'amy' | 'southern_english_female' | 'none';
  language: string;
  autoPlex: boolean;
}

export interface RecordingSession {
  id: string;
  status: 'idle' | 'recording' | 'processing' | 'responding';
  audioBuffer: Buffer[];
  transcript: string;
  response: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}
