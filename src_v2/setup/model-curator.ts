/**
 * Curated GGUF catalogue + hardware-aware ranking. All models are
 * ungated, Q4_K_M quants from bartowski/unsloth on HuggingFace.
 * Last refreshed: 2026-04 (Gemma 4, Qwen 3.5, Phi-4, Mistral Small 3.2).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HardwareProfile } from './hardware-detect.js';

export interface LocalModel {
  id: string;
  name: string;
  provider: string;
  sizeGB: number;
  minRamGB: number;
  minVramGB: number | null;
  filename: string;
  hfRepo: string;
  hfFile: string;
  description: string;
  tier: 'micro' | 'base' | 'mid' | 'high' | 'pro';
  released: string;
  tags: string[];
}

export const LOCAL_MODELS: LocalModel[] = [
  // Micro tier — CPU only, 2–4 GB RAM
  {
    id: 'qwen3.5-0.8b', name: 'Qwen 3.5 0.8B', provider: 'Alibaba',
    sizeGB: 0.53, minRamGB: 2, minVramGB: null,
    filename: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    hfRepo: 'unsloth/Qwen3.5-0.8B-GGUF', hfFile: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    description: 'Lightest model. 262K context. Thinking mode. Feb 2026.',
    tier: 'micro', released: '2026-02', tags: ['fastest', 'cpu', 'thinking'],
  },
  {
    id: 'qwen3.5-2b', name: 'Qwen 3.5 2B', provider: 'Alibaba',
    sizeGB: 1.28, minRamGB: 3, minVramGB: null,
    filename: 'Qwen3.5-2B-Q4_K_M.gguf',
    hfRepo: 'unsloth/Qwen3.5-2B-GGUF', hfFile: 'Qwen3.5-2B-Q4_K_M.gguf',
    description: '262K context, multilingual, thinking mode. Feb 2026.',
    tier: 'micro', released: '2026-02', tags: ['fast', 'cpu', 'multilingual'],
  },
  // Base tier — CPU, 4–8 GB RAM
  {
    id: 'phi-4-mini', name: 'Phi-4 Mini', provider: 'Microsoft',
    sizeGB: 2.49, minRamGB: 4, minVramGB: null,
    filename: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    hfRepo: 'unsloth/Phi-4-mini-instruct-GGUF', hfFile: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    description: '3.8B · 128K context · best reasoning at this size. Feb 2025.',
    tier: 'base', released: '2025-02', tags: ['reasoning', 'coding', 'cpu'],
  },
  {
    id: 'gemma-4-e2b', name: 'Gemma 4 E2B', provider: 'Google',
    sizeGB: 3.11, minRamGB: 5, minVramGB: null,
    filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
    hfRepo: 'unsloth/gemma-4-E2B-it-GGUF', hfFile: 'gemma-4-E2B-it-Q4_K_M.gguf',
    description: '5B effective params · audio+image · 128K context. Apr 2026.',
    tier: 'base', released: '2026-04', tags: ['multimodal', 'cpu', 'latest'],
  },
  // Mid tier — 8 GB VRAM or 12 GB RAM
  {
    id: 'qwen3.5-9b', name: 'Qwen 3.5 9B', provider: 'Alibaba',
    sizeGB: 5.68, minRamGB: 8, minVramGB: null,
    filename: 'Qwen3.5-9B-Q4_K_M.gguf',
    hfRepo: 'unsloth/Qwen3.5-9B-GGUF', hfFile: 'Qwen3.5-9B-Q4_K_M.gguf',
    description: '262K context · multilingual · thinking mode. Feb 2026.',
    tier: 'mid', released: '2026-02', tags: ['quality', 'multilingual', 'coding'],
  },
  {
    id: 'phi-4', name: 'Phi-4', provider: 'Microsoft',
    sizeGB: 9.05, minRamGB: 12, minVramGB: 8,
    filename: 'phi-4-Q4_K_M.gguf',
    hfRepo: 'bartowski/phi-4-GGUF', hfFile: 'phi-4-Q4_K_M.gguf',
    description: '15B · 128K context · top reasoning at mid tier. Dec 2024.',
    tier: 'mid', released: '2024-12', tags: ['reasoning', 'coding', 'gpu'],
  },
  // High tier — 16 GB RAM / 16 GB VRAM
  {
    id: 'mistral-small-3.2', name: 'Mistral Small 3.2', provider: 'Mistral',
    sizeGB: 14.3, minRamGB: 18, minVramGB: 16,
    filename: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
    hfRepo: 'unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF',
    hfFile: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
    description: '24B · 128K context · top instruction-following. 2026.',
    tier: 'high', released: '2026-03', tags: ['quality', 'instruction', 'gpu'],
  },
  {
    id: 'qwen3.5-27b', name: 'Qwen 3.5 27B', provider: 'Alibaba',
    sizeGB: 16.7, minRamGB: 20, minVramGB: 16,
    filename: 'Qwen3.5-27B-Q4_K_M.gguf',
    hfRepo: 'unsloth/Qwen3.5-27B-GGUF', hfFile: 'Qwen3.5-27B-Q4_K_M.gguf',
    description: '27B · 262K context · MoE hybrid. Feb 2026.',
    tier: 'high', released: '2026-02', tags: ['quality', 'multilingual', 'gpu'],
  },
  // Pro tier — 24 GB+ VRAM
  {
    id: 'gemma-4-31b', name: 'Gemma 4 31B', provider: 'Google',
    sizeGB: 19.6, minRamGB: 24, minVramGB: 24,
    filename: 'google_gemma-4-31B-it-Q4_K_M.gguf',
    hfRepo: 'bartowski/google_gemma-4-31B-it-GGUF',
    hfFile: 'google_gemma-4-31B-it-Q4_K_M.gguf',
    description: '31B · image+text+audio · 256K context. Apr 2026.',
    tier: 'pro', released: '2026-04', tags: ['multimodal', 'latest', 'gpu'],
  },
];

export function recommendModels(hw: HardwareProfile, limit = 3): LocalModel[] {
  return LOCAL_MODELS
    .filter(m => {
      const ramOk = hw.totalRamGB >= m.minRamGB + 1;
      const vramOk = m.minVramGB === null || (hw.vramGB !== null && hw.vramGB >= m.minVramGB);
      return ramOk && vramOk;
    })
    .sort((a, b) => {
      // Newest first within tier, then size-efficiency.
      if (a.released !== b.released) return b.released.localeCompare(a.released);
      return (b.sizeGB / b.minRamGB) - (a.sizeGB / a.minRamGB);
    })
    .slice(0, limit);
}

export function getModelById(id: string): LocalModel | undefined {
  return LOCAL_MODELS.find(m => m.id === id);
}

// Default model cache lives at ~/.dirgha/models — overridable via env.
function modelCacheDir(): string {
  return process.env['DIRGHA_MODELS_DIR'] ?? join(homedir(), '.dirgha', 'models');
}

export function isModelDownloaded(model: LocalModel): boolean {
  return existsSync(join(modelCacheDir(), model.filename));
}

export function modelDownloadHint(model: LocalModel): string {
  return [
    `Download with Ollama:`,
    `  ollama pull ${model.id.replace(/\.\d+/, '')}  # nearest match in Ollama registry`,
    ``,
    `Or fetch the GGUF directly:`,
    `  mkdir -p ~/.dirgha/models && cd ~/.dirgha/models`,
    `  wget https://huggingface.co/${model.hfRepo}/resolve/main/${model.hfFile}`,
    ``,
    `Then point llama-server at it:`,
    `  llama-server -m ~/.dirgha/models/${model.filename} -c 8192 --port 8080`,
  ].join('\n');
}
