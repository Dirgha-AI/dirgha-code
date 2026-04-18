// @ts-nocheck
/**
 * voice/desktop.ts - Desktop voice recorder using LOCAL whisper.cpp only
 * NO API KEYS - 100% local processing
 */
import { spawn, execSync } from 'child_process';
import { createWriteStream, unlink, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { getModelManager } from '../models/manager.js';
import { getModelById } from '../models/registry.js';
import type { TranscriptionResult, STTOptions } from './types.js';

const unlinkAsync = promisify(unlink);

// Paths for local tools
const WHISPER_CPP_DEFAULT_PATH = join(process.env.HOME || '', '.dirgha', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_CPP_REPO = 'https://github.com/ggerganov/whisper.cpp.git';

export class DesktopVoiceRecorder {
  private recording: boolean = false;
  private tempFile: string | null = null;
  private recordingProcess: any = null;
  private whisperPath: string | null = null;
  private autoInstallAttempted: boolean = false;

  constructor() {
    this.findWhisperCpp();
  }

  /**
   * Find whisper.cpp installation
   */
  private findWhisperCpp(): void {
    // Check common locations
    const candidates = [
      WHISPER_CPP_DEFAULT_PATH,
      '/usr/local/bin/whisper-cli',
      '/usr/bin/whisper-cli',
      join(process.env.HOME || '', 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
      join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
    ];

    for (const path of candidates) {
      if (existsSync(path)) {
        this.whisperPath = path;
        return;
      }
    }

    // Also check in PATH
    try {
      const which = execSync('which whisper-cli', { encoding: 'utf-8' }).trim();
      if (which) this.whisperPath = which;
    } catch {}
  }

  /**
   * Check if whisper.cpp is available
   */
  isWhisperAvailable(): boolean {
    return this.whisperPath !== null && existsSync(this.whisperPath);
  }

  /**
   * Auto-install whisper.cpp if not found
   */
  async autoInstall(): Promise<boolean> {
    console.log('🔧 whisper.cpp not found. Installing...');
    
    const installPath = join(process.env.HOME || '', '.dirgha', 'whisper.cpp');
    
    try {
      // Clone repo
      console.log('  Cloning whisper.cpp...');
      execSync(`git clone ${WHISPER_CPP_REPO} "${installPath}"`, {
        stdio: 'pipe',
        timeout: 120000
      });

      // Download base model
      console.log('  Downloading base model...');
      execSync(`cd "${installPath}" && sh ./models/download-ggml-model.sh base`, {
        stdio: 'pipe',
        timeout: 120000
      });

      // Build
      console.log('  Building whisper.cpp...');
      const isMac = process.platform === 'darwin';
      const buildCmd = isMac 
        ? `cmake -B build -DGGML_METAL=ON && cmake --build build -j`
        : `cmake -B build && cmake --build build -j`;
      
      execSync(`cd "${installPath}" && ${buildCmd}`, {
        stdio: 'pipe',
        timeout: 300000
      });

      this.whisperPath = join(installPath, 'build', 'bin', 'whisper-cli');
      console.log('✓ whisper.cpp installed successfully');
      return true;

    } catch (err: any) {
      console.error('✗ Installation failed:', err.message);
      console.log('\nPlease install manually:');
      console.log('  git clone https://github.com/ggerganov/whisper.cpp.git');
      console.log('  cd whisper.cpp');
      console.log('  sh ./models/download-ggml-model.sh base');
      console.log('  cmake -B build');
      console.log('  cmake --build build -j');
      return false;
    }
  }

  /**
   * Start recording from microphone
   */
  async startRecording(): Promise<void> {
    if (this.recording) return;

    // Ensure whisper.cpp is available
    if (!this.isWhisperAvailable()) {
      const installed = await this.autoInstall();
      if (!installed) {
        throw new Error('whisper.cpp is required for local voice. Run with --setup flag.');
      }
    }

    this.tempFile = join(tmpdir(), `dirgha-voice-${Date.now()}.wav`);
    this.recording = true;

    // Use sox for cross-platform recording
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      // macOS - use sox or rec
      command = 'rec';
      args = ['-r', '16000', '-c', '1', '-b', '16', this.tempFile, 'silence', '1', '0.1', '1%', '1', '1.0', '1%'];
    } else if (platform === 'linux') {
      // Linux - use arecord
      command = 'arecord';
      args = ['-f', 'cd', '-r', '16000', '-c', '1', '-d', '30', this.tempFile];
    } else {
      // Windows - use sox or PowerShell
      command = 'sox';
      args = ['-d', '-r', '16000', '-c', '1', '-b', '16', this.tempFile];
    }

    try {
      this.recordingProcess = spawn(command, args, { stdio: 'ignore' });
      
      this.recordingProcess.on('error', (err: Error) => {
        console.error('Recording error:', err.message);
        this.recording = false;
      });

    } catch (err: any) {
      this.recording = false;
      throw new Error(`Failed to start recording: ${err.message}. Ensure sox/arecord is installed.`);
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<string | null> {
    if (!this.recording || !this.tempFile) return null;

    // Kill recording process
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGTERM');
      // Wait a moment for cleanup
      await new Promise(r => setTimeout(r, 200));
    }

    this.recording = false;

    // Verify file exists and has content
    if (!existsSync(this.tempFile)) {
      return null;
    }

    const stats = require('fs').statSync(this.tempFile);
    if (stats.size < 1000) {
      // Too small - probably no audio
      await unlinkAsync(this.tempFile).catch(() => {});
      return null;
    }

    return this.tempFile;
  }

  /**
   * Transcribe audio using local whisper.cpp
   * NO CLOUD - 100% LOCAL
   */
  async transcribe(audioPath: string, options: STTOptions = {}): Promise<TranscriptionResult> {
    const { language = 'en' } = options;

    if (!this.isWhisperAvailable() || !this.whisperPath) {
      throw new Error('whisper.cpp not available');
    }

    const manager = getModelManager();
    
    // Find installed whisper model
    let modelId = 'whisper-base';
    if (!manager.isInstalled(modelId)) {
      if (manager.isInstalled('whisper-tiny')) modelId = 'whisper-tiny';
      else if (manager.isInstalled('whisper-small')) modelId = 'whisper-small';
      else if (manager.isInstalled('whisper-large-v3-turbo')) modelId = 'whisper-large-v3-turbo';
    }

    const model = getModelById(modelId);
    if (!model) {
      throw new Error('No whisper model found. Run: dirgha models setup');
    }

    const modelPath = manager.getModelPath(modelId);

    try {
      // Run whisper.cpp locally
      const output = execSync(
        `"${this.whisperPath}" -m "${modelPath}" -f "${audioPath}" -l ${language} --output-json --no-prints`,
        {
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024 // 10MB
        }
      );

      // Parse JSON output
      const lines = output.trim().split('\n');
      const jsonLine = lines.find(l => l.trim().startsWith('{'));
      
      if (!jsonLine) {
        throw new Error('No transcription output from whisper');
      }

      const result = JSON.parse(jsonLine);
      
      // Extract text from segments
      const text = result.transcription?.map((s: any) => s.text).join(' ') || 
                   result.text || 
                   '';

      // Cleanup temp file
      await unlinkAsync(audioPath).catch(() => {});

      return {
        text: text.trim(),
        confidence: 1.0, // whisper doesn't provide confidence
        language: result.language || language
      };

    } catch (err: any) {
      // Cleanup on error
      await unlinkAsync(audioPath).catch(() => {});
      
      if (err.message?.includes('whisper')) {
        throw new Error(`Transcription failed: ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Stream transcription in real-time (advanced)
   */
  async *transcribeStream(audioPath: string, options: STTOptions = {}): AsyncGenerator<string> {
    // This would use whisper-stream for real-time
    // Implementation simplified for now
    const result = await this.transcribe(audioPath, options);
    yield result.text;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.tempFile && existsSync(this.tempFile)) {
      unlinkAsync(this.tempFile).catch(() => {});
    }
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGKILL');
    }
  }
}
