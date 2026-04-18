/**
 * voice/transcribe.ts — Whisper.cpp transcription
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { TranscriptionResult } from './types.js';

const MODELS_DIR = join(homedir(), '.dirgha', 'models');

export function transcribe(
  audioPath: string,
  model: string = 'base'
): TranscriptionResult {
  const modelPath = join(MODELS_DIR, `ggml-${model}.bin`);
  
  if (!existsSync(modelPath)) {
    throw new Error(`Model not found: ${model}. Run: dirgha models download whisper-${model}`);
  }

  try {
    // In real implementation: call whisper.cpp binary
    const output = execSync(
      `whisper-cpp -m ${modelPath} -f ${audioPath} -np`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    return {
      text: output.trim(),
      confidence: 0.9,
      language: 'en',
      duration: 5.0
    };
  } catch {
    return {
      text: '[Transcription failed]',
      confidence: 0,
      language: 'unknown',
      duration: 0
    };
  }
}

export function isModelAvailable(model: string): boolean {
  return existsSync(join(MODELS_DIR, `ggml-${model}.bin`));
}
