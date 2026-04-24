// @ts-nocheck
/**
 * voice/index.ts — Voice typing main interface
 *
 * EXPERIMENTAL — hidden behind DIRGHA_EXPERIMENTAL=1 (see S2.7 launch
 * plan). The voice module ships without type checking because its
 * transport layer (desktop mic, mobile bridge, browser extension) is
 * still stabilizing. When voice graduates, strip @ts-nocheck file by
 * file and remove the experimental gate in src/index.ts.
 *
 * Unified API for all voice modes:
 * - Desktop: Native microphone + Whisper
 * - Mobile: Phone bridge via QR
 * - Browser: Extension bridge
 */
import { DesktopVoiceRecorder } from './desktop.js';
import { MobileVoiceBridge } from './mobile-bridge.js';
import { BrowserExtensionBridge } from './browser-extension.js';
import type { VoiceMode, VoiceState } from './types.js';

export class VoiceTyping {
  private mode: VoiceMode = 'desktop';
  private desktop: DesktopVoiceRecorder | null = null;
  private mobile: MobileVoiceBridge | null = null;
  private browser: BrowserExtensionBridge | null = null;
  private state: VoiceState = {
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    mode: 'desktop',
    confidence: 0
  };
  private _onTranscript: ((text: string) => void) | null = null;

  constructor(mode: VoiceMode = 'desktop') {
    this.mode = mode;
    this.state.mode = mode;
  }

  async initialize(): Promise<boolean> {
    switch (this.mode) {
      case 'desktop':
        this.desktop = new DesktopVoiceRecorder();
        return true;

      case 'mobile':
        this.mobile = new MobileVoiceBridge();
        const session = await this.mobile.startBridge();
        this.mobile.displayQR(session);
        this.mobile.onTranscriptReceived((text) => {
          this.state.transcript = text;
          this._onTranscript?.(text);
        });
        return true;

      case 'browser':
        this.browser = new BrowserExtensionBridge();
        const connected = await this.browser.connect();
        if (connected) {
          this.browser.onTranscriptReceived((text) => {
            this.state.transcript = text;
            this._onTranscript?.(text);
          });
        }
        return connected;
    }
  }

  async startListening(): Promise<void> {
    if (this.state.isListening) return;

    this.state = { ...this.state, isListening: true, transcript: '', error: null };

    switch (this.mode) {
      case 'desktop':
        if (!this.desktop) throw new Error('Voice not initialized');
        await this.desktop.startRecording();
        break;

      case 'mobile':
        console.log('📱 Speak into your phone. Press Enter when done...');
        await new Promise(r => process.stdin.once('data', r));
        break;

      case 'browser':
        await this.browser?.startRecording();
        break;
    }
  }

  async stopListening(): Promise<string> {
    if (!this.state.isListening) return '';

    this.state.isListening = false;

    switch (this.mode) {
      case 'desktop':
        if (!this.desktop) return '';
        const audioPath = await this.desktop.stopRecording();
        if (!audioPath) return '';
        
        try {
          const result = await this.desktop.transcribe(audioPath);
          this.state.transcript = result.text;
          this.state.confidence = result.confidence;
          return result.text;
        } catch (err: any) {
          this.state.error = err.message;
          return '';
        }

      case 'mobile':
        this.mobile?.stopBridge('');
        return this.state.transcript;

      case 'browser':
        this.browser?.stopRecording();
        return this.state.transcript;
    }
  }

  onTranscript(callback: (text: string) => void): void {
    this._onTranscript = callback;
  }

  getState(): VoiceState {
    return { ...this.state };
  }

  cleanup(): void {
    this.desktop?.cleanup();
    this.mobile?.stopBridge('');
    this.browser?.stopRecording();
  }
}
