/**
 * Hardware probe — Node built-ins only. Returns a typed profile that
 * downstream model-recommendation code uses to filter the catalogue.
 * GPU detection is best-effort: nvidia-smi if present, null otherwise.
 */
export interface HardwareProfile {
    cpuCores: number;
    totalRamGB: number;
    freeRamGB: number;
    gpuName: string | null;
    vramGB: number | null;
    avx2: boolean;
    platform: 'linux' | 'mac' | 'windows';
}
export declare function detectHardware(): Promise<HardwareProfile>;
export declare function summariseHardware(hw: HardwareProfile): string[];
