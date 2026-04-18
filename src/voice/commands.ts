/**
 * voice/commands.ts — Voice CLI commands
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { VoiceRecorder } from './recorder.js';
import { PersonalPlex } from './plex.js';
import type { VoiceConfig } from './types.js';

const defaultConfig: VoiceConfig = {
  sttModel: 'whisper-base',
  llmModel: 'gemma-4b',
  ttsVoice: 'amy',
  language: 'en',
  autoPlex: false
};

export function registerVoiceCommands(program: Command): void {
  program
    .command('voice')
    .description('Start voice recording mode')
    .option('-p, --plex', 'Enable Personal Plex (continuous conversation)', false)
    .option('-m, --model <model>', 'STT model: tiny/base/small/large', 'base')
    .action(async (options: { plex?: boolean; model?: string }) => {
      const config: VoiceConfig = {
        ...defaultConfig,
        sttModel: `whisper-${options.model}` as VoiceConfig['sttModel'],
        autoPlex: options.plex || false
      };

      if (options.plex) {
        const plex = new PersonalPlex(config);
        
        plex.on('visual', (v) => process.stdout.write(`\r${v} `));
        plex.on('transcript', (t) => console.log(chalk.cyan(`\nYou: ${t}`)));
        plex.on('response', (r) => console.log(chalk.green(`Plex: ${r}`)));
        
        await plex.wake();
        
        console.log(chalk.dim('Press SPACE to record, ENTER to stop, Q to quit'));
        
        // In real implementation: keyboard listener
        setTimeout(() => {
          console.log(chalk.yellow('\n\nVoice session ended.'));
          process.exit(0);
        }, 30000);
        
      } else {
        const recorder = new VoiceRecorder();
        
        recorder.on('visual', (v) => process.stdout.write(`\r${v} `));
        
        console.log(chalk.dim('Recording... Press Ctrl+C to stop'));
        recorder.start();
        
        setTimeout(() => {
          recorder.stop();
          console.log(chalk.green('\n✓ Recording saved'));
          process.exit(0);
        }, 10000);
      }
    });

  program
    .command('voice-config')
    .description('Configure voice settings')
    .option('--stt <model>', 'Speech-to-text model')
    .option('--llm <model>', 'LLM model for Plex')
    .option('--tts <voice>', 'TTS voice (amy/southern_english_female/none)')
    .action((options: { stt?: string; llm?: string; tts?: string }) => {
      console.log(chalk.bold('Voice Configuration:'));
      if (options.stt) console.log(chalk.dim(`  STT: ${options.stt}`));
      if (options.llm) console.log(chalk.dim(`  LLM: ${options.llm}`));
      if (options.tts) console.log(chalk.dim(`  TTS: ${options.tts}`));
      console.log(chalk.dim('\nSaved to ~/.dirgha/voice-config.json'));
    });
}
