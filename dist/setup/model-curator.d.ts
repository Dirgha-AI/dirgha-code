/**
 * Curated GGUF catalogue + hardware-aware ranking. All models are
 * ungated, Q4_K_M quants from bartowski/unsloth on HuggingFace.
 * Last refreshed: 2026-04 (Gemma 4, Qwen 3.5, Phi-4, Mistral Small 3.2).
 */
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
export declare const LOCAL_MODELS: LocalModel[];
export declare function recommendModels(hw: HardwareProfile, limit?: number): LocalModel[];
export declare function getModelById(id: string): LocalModel | undefined;
export declare function isModelDownloaded(model: LocalModel): boolean;
export declare function modelDownloadHint(model: LocalModel): string;
