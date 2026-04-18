// @ts-nocheck

/**
 * repl/slash/voice.ts — Voice slash commands for REPL
 */
import type { SlashCommand, ReplContext } from './types.js';
import chalk from 'chalk';
import { VoiceTyping } from '../../voice/index.js';

export const voiceCommands: SlashCommand[] = [
  {
    name: '/voice',
    description: 'Start voice typing (desktop mic)',
    category: 'input',
    execute: async (_args: string, _ctx: ReplContext) => {
      console.log(chalk.blue('🎤 Voice typing - desktop mode'));
      console.log(chalk.dim('  Recording... Press Enter when done\n'));

      const voice = new VoiceTyping('desktop');
      await voice.initialize();
      await voice.startListening();

      await new Promise(r => process.stdin.once('data', r));
      const transcript = await voice.stopListening();
      voice.cleanup();

      if (transcript) {
        console.log(chalk.green(`✓ Heard: ${transcript}`));
        return { type: 'text', content: transcript };
      }
      console.log(chalk.red('✗ No speech detected'));
      return null;
    }
  },
  {
    name: '/voice-mobile',
    description: 'Use phone as microphone',
    category: 'input',
    execute: async (_args: string, _ctx: ReplContext) => {
      console.log(chalk.blue('📱 Mobile voice bridge'));

      const voice = new VoiceTyping('mobile');
      await voice.initialize();

      console.log(chalk.yellow('  Speak into your phone...'));
      console.log(chalk.dim('  Press Enter when done\n'));

      await new Promise(r => process.stdin.once('data', r));
      const transcript = await voice.stopListening();
      voice.cleanup();

      if (transcript) {
        console.log(chalk.green(`✓ Heard: ${transcript}`));
        return { type: 'text', content: transcript };
      }
      return null;
    }
  },
  {
    name: '/voice-browser',
    description: 'Use browser extension for voice',
    category: 'input',
    execute: async (_args: string, _ctx: ReplContext) => {
      console.log(chalk.blue('🔌 Browser extension voice'));

      const voice = new VoiceTyping('browser');
      const connected = await voice.initialize();

      if (!connected) {
        console.log(chalk.red('✗ Extension not connected'));
        console.log(chalk.dim('  Run: dirgha voice install-extension'));
        return null;
      }

      await voice.startListening();
      console.log(chalk.yellow('  Recording via browser...'));

      await new Promise(r => setTimeout(r, 5000)); // 5 sec recording
      const transcript = await voice.stopListening();
      voice.cleanup();

      if (transcript) {
        console.log(chalk.green(`✓ Heard: ${transcript}`));
        return { type: 'text', content: transcript };
      }
      return null;
    }
  }
];
