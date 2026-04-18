// @ts-nocheck

/**
 * commands/voice-entry.ts - Main voice command entry point
 * Unified interface for voice typing and Personal Plex
 */
import chalk from 'chalk';
import { getModelManager } from '../models/manager.js';
import { DesktopVoiceRecorder } from '../voice/desktop.js';
import { PersonalPlex } from '../voice/personal-plex.js';
import { MobileVoiceBridge } from '../voice/mobile-bridge.js';

interface VoiceOptions {
  setup?: boolean;
  lang?: string;
  plex?: boolean;
  mobile?: boolean;
}

export async function voiceCommand(opts: VoiceOptions): Promise<void> {
  const manager = getModelManager();

  // Setup mode - install models
  if (opts.setup) {
    console.log(chalk.blue('🔧 Voice Setup - Local Models\n'));
    console.log(chalk.dim('This will download voice models for 100% local processing.\n'));
    
    const { setupCommand } = await import('./models.js');
    // Reuse the models setup command
    const modelsCmd = {
      list: () => {},
      download: async (id: string) => {
        await manager.download(id);
      },
      remove: () => {},
      cleanup: () => {},
      setup: async () => {
        // Download voice essentials
        const essentialModels = ['whisper-base', 'gemma-4-4b', 'piper-en-us'];
        for (const modelId of essentialModels) {
          if (!manager.isInstalled(modelId)) {
            console.log(chalk.yellow(`\nDownloading ${modelId}...`));
            await manager.download(modelId, {
              onProgress: (p) => {
                const bar = '█'.repeat(p.percentage / 5) + '░'.repeat(20 - p.percentage / 5);
                process.stdout.write(`\r${bar} ${p.percentage}%`);
              }
            });
            console.log();
          }
        }
        console.log(chalk.green('\n✓ Voice setup complete!'));
      }
    };
    await modelsCmd.setup();
    return;
  }

  // Check if required models are installed
  const hasWhisper = manager.isInstalled('whisper-base') || 
                     manager.isInstalled('whisper-tiny') ||
                     manager.isInstalled('whisper-small');
  
  if (!hasWhisper) {
    console.log(chalk.yellow('⚠ Voice models not installed'));
    console.log(chalk.dim('  Run: dirgha voice --setup\n'));
    return;
  }

  // Personal Plex mode - two-way voice
  if (opts.plex) {
    console.log(chalk.blue('🎙️ Starting Personal Plex\n'));
    console.log(chalk.dim('Say "Hey Dirgha" to wake, or press Enter to start listening.\n'));
    
    const plex = new PersonalPlex();
    await plex.start();
    return;
  }

  // Mobile bridge mode
  if (opts.mobile) {
    console.log(chalk.blue('📱 Mobile Voice Bridge\n'));
    
    const bridge = new MobileVoiceBridge();
    const session = await bridge.startBridge();
    bridge.displayQR(session);
    
    bridge.onTranscriptReceived((text) => {
      console.log(chalk.green(`\n✓ Heard: ${text}`));
      console.log(chalk.dim('  Send to agent? (y/n): '));
      // Handle response...
    });

    console.log(chalk.yellow('Waiting for mobile connection...'));
    console.log(chalk.dim('Press Enter to stop'));
    await new Promise(r => process.stdin.once('data', r));
    bridge.stopBridge(session.sessionId);
    return;
  }

  // Default: Desktop voice typing
  console.log(chalk.blue('🎤 Voice Typing (Local)\n'));
  console.log(chalk.yellow('⏺  Recording... Press Enter to stop\n'));

  const recorder = new DesktopVoiceRecorder();
  await recorder.startRecording();

  // Wait for Enter key
  await new Promise(r => process.stdin.once('data', r));

  const audioPath = await recorder.stopRecording();
  if (!audioPath) {
    console.log(chalk.red('\n✗ Recording failed'));
    return;
  }

  console.log(chalk.dim('  Transcribing locally...'));
  
  try {
    const result = await recorder.transcribe(audioPath, { 
      language: opts.lang || 'en' 
    });
    
    if (result.text) {
      console.log(chalk.green('\n✓ Transcribed:'));
      console.log(chalk.white(result.text));
      
      // Ask if user wants to send to agent
      console.log(chalk.dim('\n  Send to agent? (y/n): '));
      const answer = await new Promise<string>(r => 
        process.stdin.once('data', d => r(d.toString().trim()))
      );
      
      if (answer.toLowerCase() === 'y') {
        // TODO: Send to agent for processing
        console.log(chalk.dim('  Sending to agent...'));
      }
    } else {
      console.log(chalk.red('\n✗ No speech detected'));
    }
  } catch (err: any) {
    console.error(chalk.red(`\n✗ Transcription failed: ${err.message}`));
  } finally {
    recorder.cleanup();
  }
}
