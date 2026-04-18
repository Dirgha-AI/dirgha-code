// @ts-nocheck
/**
 * voice/tts.ts - Text-to-Speech using Piper (local, fast)
 * Zero API keys - runs entirely on-device
 */
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getModelManager } from '../models/manager.js';

const PIPER_DEFAULT_PATH = join(homedir(), '.local', 'bin', 'piper');
const PIPER_VOICES_PATH = join(homedir(), '.dirgha', 'models');

interface TTSOptions {
  voice?: string;
  speed?: number;
  outputPath?: string;
}

export class PiperTTS {
  private piperPath: string | null = null;
  private defaultVoice: string = 'piper-en-us';

  constructor() {
    this.findPiper();
  }

  /**
   * Find Piper installation
   */
  private findPiper(): void {
    const candidates = [
      PIPER_DEFAULT_PATH,
      '/usr/local/bin/piper',
      '/usr/bin/piper',
      join(homedir(), 'piper', 'piper'),
      'piper' // in PATH
    ];

    for (const path of candidates) {
      try {
        execSync(`"${path}" --help`, { stdio: 'pipe' });
        this.piperPath = path;
        return;
      } catch {}
    }
  }

  /**
   * Check if Piper is available
   */
  isAvailable(): boolean {
    return this.piperPath !== null;
  }

  /**
   * Auto-install Piper
   */
  async autoInstall(): Promise<boolean> {
    console.log('🔧 Piper TTS not found. Installing...');
    
    const platform = process.platform;
    const installDir = join(homedir(), '.local', 'bin');

    try {
      // Download Piper binary
      const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
      const version = '1.2.0';
      
      const downloadUrl = platform === 'darwin'
        ? `https://github.com/rhasspy/piper/releases/download/v${version}/piper_${arch}.tar.gz`
        : `https://github.com/rhasspy/piper/releases/download/v${version}/piper_${arch}.tar.gz`;

      console.log('  Downloading Piper...');
      const curlCmd = `curl -L "${downloadUrl}" -o /tmp/piper.tar.gz`;
      execSync(curlCmd, { stdio: 'pipe', timeout: 120000 });

      // Extract
      console.log('  Extracting...');
      execSync(`mkdir -p "${installDir}" && tar -xzf /tmp/piper.tar.gz -C "${installDir}"`, {
        stdio: 'pipe'
      });

      // Make executable
      execSync(`chmod +x "${join(installDir, 'piper')}"`, { stdio: 'pipe' });

      this.findPiper();
      
      if (this.piperPath) {
        console.log('✓ Piper installed');
        return true;
      }
      
      return false;

    } catch (err: any) {
      console.error('✗ Installation failed:', err.message);
      console.log('\nPlease install manually from: https://github.com/rhasspy/piper/releases');
      return false;
    }
  }

  /**
   * Speak text
   */
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.isAvailable()) {
      const installed = await this.autoInstall();
      if (!installed) {
        console.log(chalk.dim(`[Voice: ${text}]`));
        return;
      }
    }

    const manager = getModelManager();
    const voiceId = options.voice || this.defaultVoice;
    const modelPath = manager.getModelPath(voiceId);

    if (!existsSync(modelPath)) {
      console.log(chalk.dim(`[Voice: ${text}]`));
      return;
    }

    try {
      // Generate audio to temp file
      const outputPath = options.outputPath || join(homedir(), '.dirgha', 'tmp-tts.wav');
      
      const piper = spawn(this.piperPath!, [
        '-m', modelPath,
        '-f', outputPath,
        '--length_scale', String(1.0 / (options.speed || 1.0))
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      piper.stdin.write(text);
      piper.stdin.end();

      await new Promise((resolve, reject) => {
        piper.on('close', (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`Piper exited with code ${code}`));
        });
        piper.on('error', reject);
      });

      // Play audio
      await this.playAudio(outputPath);

      // Cleanup
      try {
        const { unlinkSync } = await import('fs');
        if (!options.outputPath) unlinkSync(outputPath);
      } catch {}

    } catch (err: any) {
      console.log(chalk.dim(`[Voice: ${text}]`));
    }
  }

  /**
   * Play audio file
   */
  private async playAudio(audioPath: string): Promise<void> {
    const platform = process.platform;
    let player: string;
    let args: string[];

    if (platform === 'darwin') {
      player = 'afplay';
      args = [audioPath];
    } else if (platform === 'linux') {
      // Try multiple players
      const players = ['paplay', 'aplay', 'play'];
      for (const p of players) {
        try {
          execSync(`which ${p}`, { stdio: 'pipe' });
          player = p;
          break;
        } catch {}
      }
      args = player === 'play' ? [audioPath] : [audioPath];
    } else {
      // Windows
      player = 'powershell';
      args = ['-c', `(New-Object Media.SoundPlayer "${audioPath}").PlaySync()`];
    }

    if (!player!) {
      throw new Error('No audio player found');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(player, args, { stdio: 'ignore' });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Player exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  /**
   * List available voices
   */
  listVoices(): string[] {
    const manager = getModelManager();
    return manager.listInstalled()
      .filter(m => m.type === 'tts')
      .map(m => m.id);
  }
}

// Helper import for chalk (used in speak method)
import chalk from 'chalk';
