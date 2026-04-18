// @ts-nocheck
/**
 * voice/personal-plex.ts - Personal Plex: Two-way voice assistant
 * STT → Local LLM → TTS loop, 100% offline
 *
 * Wake word: "Hey Dirgha" (or press Enter)
 * Flow: Voice Input → whisper.cpp → Gemma 4 → Piper TTS → Voice Output
 *
 * Flags: --plex (ambient), --voice (PTT in REPL), --tts (spoken responses)
 */
import chalk from 'chalk';
import { DesktopVoiceRecorder } from './desktop.js';
import { LocalLLM } from '../llm/local.js';
import { PiperTTS } from './tts.js';
import type { TranscriptionResult } from './types.js';

interface PlexConfig {
  wakeWord: string;
  maxConversationTurns: number;
  voiceEnabled: boolean;
  language: string;
}

export class PersonalPlex {
  private recorder: DesktopVoiceRecorder;
  private llm: LocalLLM;
  private tts: PiperTTS;
  private config: PlexConfig;
  private conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private isListening: boolean = false;
  private isSpeaking: boolean = false;

  constructor(config?: Partial<PlexConfig>) {
    this.config = {
      wakeWord: 'hey dirgha',
      maxConversationTurns: 20,
      voiceEnabled: true,
      language: 'en',
      ...config
    };

    this.recorder = new DesktopVoiceRecorder();
    this.llm = new LocalLLM();
    this.tts = new PiperTTS();
  }

  /**
   * Start Personal Plex voice loop
   */
  async start(): Promise<void> {
    console.log('\n🎙️ Personal Plex Activated');
    console.log('   Two-way voice communication (100% local)\n');
    
    console.log('Commands:');
    console.log('  • Say "Hey Dirgha" to wake');
    console.log('  • Speak naturally after wake');
    console.log('  • Say "Goodbye" to exit');
    console.log('  • Press Enter anytime to start/stop\n');

    // Welcome message
    if (this.config.voiceEnabled) {
      await this.speak('Personal Plex activated. How can I help you?');
    } else {
      console.log('💬 [Text mode - no voice output]');
    }

    // Main loop
    while (true) {
      // Wait for wake word or Enter key
      const shouldListen = await this.waitForWake();
      if (!shouldListen) break;

      // Listen for command
      const transcription = await this.listen();
      if (!transcription.text) continue;

      // Check for exit
      if (this.isExitCommand(transcription.text)) {
        await this.speak('Goodbye!');
        break;
      }

      // Process with local LLM
      const response = await this.processCommand(transcription.text);

      // Speak response
      if (this.config.voiceEnabled) {
        await this.speak(response);
      } else {
        console.log(`\n🤖 ${response}\n`);
      }

      // Limit conversation history
      if (this.conversation.length > this.config.maxConversationTurns * 2) {
        this.conversation = this.conversation.slice(-this.config.maxConversationTurns * 2);
      }
    }

    console.log('\n👋 Personal Plex deactivated\n');
  }

  /**
   * Wait for wake word ("Hey Dirgha") or Enter key
   * Uses simple wake word detection or keypress
   */
  private async waitForWake(): Promise<boolean> {
    console.log(chalk.dim('  [Listening for wake word...]'));
    
    // For now: simple Enter key press
    // In production: would use Porcupine wake word engine
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(true), 30000); // 30s timeout
      
      process.stdin.once('data', () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  /**
   * Listen and transcribe
   */
  private async listen(): Promise<TranscriptionResult> {
    this.isListening = true;
    console.log(chalk.yellow('  🎤 Listening... (speak now)'));

    try {
      await this.recorder.startRecording();
      
      // Auto-stop after silence or max 10 seconds
      await this.waitForSilenceOrTimeout(10000);
      
      const audioPath = await this.recorder.stopRecording();
      if (!audioPath) {
        return { text: '', confidence: 0 };
      }

      console.log(chalk.dim('  🔄 Processing...'));
      const result = await this.recorder.transcribe(audioPath, {
        language: this.config.language
      });

      if (result.text) {
        console.log(chalk.cyan(`  You: "${result.text}"`));
        this.conversation.push({ role: 'user', content: result.text });
      }

      return result;

    } catch (err: any) {
      console.error(chalk.red(`  ✗ Listen failed: ${err.message}`));
      return { text: '', confidence: 0 };
    } finally {
      this.isListening = false;
    }
  }

  /**
   * Wait for silence or timeout
   * Simplified: just waits fixed time
   */
  private async waitForSilenceOrTimeout(timeoutMs: number): Promise<void> {
    // In production: would use VAD (Voice Activity Detection)
    // For now: wait fixed time or Enter key
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      process.stdin.once('data', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Process command with local LLM (Gemma 4)
   */
  private async processCommand(text: string): Promise<string> {
    // Check for built-in commands first
    const builtinResponse = this.checkBuiltInCommands(text);
    if (builtinResponse) return builtinResponse;

    try {
      const systemPrompt = `You are Dirgha, a helpful AI coding assistant. 
The user is speaking to you via voice. Keep responses concise (1-2 sentences max).
You are running 100% locally on their device - no cloud.

Conversation context:
${this.conversation.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}`;

      const response = await this.llm.complete(text, {
        systemPrompt,
        maxTokens: 150,
        temperature: 0.7
      });

      this.conversation.push({ role: 'assistant', content: response });
      return response;

    } catch (err: any) {
      return `Sorry, I couldn't process that. Error: ${err.message}`;
    }
  }

  /**
   * Check for built-in voice commands
   */
  private checkBuiltInCommands(text: string): string | null {
    const lower = text.toLowerCase();

    // Exit commands
    if (['goodbye', 'bye', 'exit', 'quit', 'stop'].some(w => lower.includes(w))) {
      return 'Goodbye! Closing Personal Plex.';
    }

    // Help
    if (lower.includes('help')) {
      return 'You can ask me to write code, explain concepts, or help debug. Say "goodbye" to exit.';
    }

    // Status
    if (lower.includes('status') || lower.includes('what can you do')) {
      return 'I am running locally with whisper.cpp for voice, Gemma 4 for reasoning, and Piper for speech. All processing happens on your device.';
    }

    return null;
  }

  /**
   * Speak text using TTS
   */
  private async speak(text: string): Promise<void> {
    if (!this.config.voiceEnabled) return;

    this.isSpeaking = true;
    console.log(chalk.green(`  🤖 ${text}`));

    try {
      await this.tts.speak(text);
    } catch (err: any) {
      console.log(chalk.dim(`  [TTS: ${text}]`));
    } finally {
      this.isSpeaking = false;
    }
  }

  /**
   * Check if command is exit
   */
  private isExitCommand(text: string): boolean {
    const exitWords = ['goodbye', 'bye', 'exit', 'quit', 'stop', 'shutdown'];
    return exitWords.some(w => text.toLowerCase().includes(w));
  }

  /**
   * Push-to-talk: Ctrl+M toggles recording, injects transcript via callback.
   * Designed for REPL integration. Returns cleanup fn.
   */
  async startPTT(onTranscript: (text: string) => void): Promise<() => void> {
    const rl = await import('readline');
    rl.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    let recording = false;

    const onKeypress = async (_: any, key: any) => {
      if (!key || !key.ctrl || key.name !== 'm') return;
      if (!recording) {
        recording = true;
        process.stdout.write('\r🎤 Recording... (Ctrl+M to stop)  ');
        await this.recorder.startRecording();
      } else {
        recording = false;
        process.stdout.write('\r🔄 Processing...                  ');
        const audioPath = await this.recorder.stopRecording();
        if (audioPath) {
          const result = await this.recorder.transcribe(audioPath, { language: this.config.language });
          if (result.text) {
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
            onTranscript(result.text);
          } else {
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
          }
        }
      }
    };

    process.stdin.on('keypress', onKeypress);
    return () => {
      process.stdin.off('keypress', onKeypress);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  }
}

/**
 * Wire PTT into an existing readline interface (REPL integration).
 * Transcript is injected into the readline input buffer — user hits Enter to execute.
 */
export async function runVoiceInREPL(readlineInterface: any): Promise<void> {
  const plex = new PersonalPlex({ voiceEnabled: true });
  const cleanup = await plex.startPTT((text: string) => {
    readlineInterface.line = text;
    if (typeof readlineInterface._refreshLine === 'function') {
      readlineInterface._refreshLine();
    } else {
      // fallback: write text visually
      process.stdout.write(text);
    }
  });

  return new Promise((resolve) => {
    readlineInterface.once('close', () => { cleanup(); resolve(); });
  });
}
