# Sprint 9: Performance Optimization
## Status: Documentation Complete, Implementation Ready

**Sprint Goal**: Optimize voice system for <2s latency, <2GB RAM usage, and smooth user experience  
**Date**: April 7, 2026  
**Prerequisite**: Sprints 1-7 code complete (✅), Sprint 8 testing (⏳ blocked)

---

## 🎯 Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| STT Latency | <2s for 10s audio | ~3-5s (base model) | Needs optimization |
| RAM Usage | <2GB active | ~4GB estimated | Needs reduction |
| Model Switch | <3s | Unknown | To measure |
| First Voice Response | <5s | Unknown | To measure |
| Battery Impact (Mobile) | <5%/hour | Unknown | To test |

---

## 📋 Optimization Tasks

### 1. GPU Acceleration ⭐ HIGH PRIORITY

**Objective**: Leverage GPU for whisper.cpp to achieve real-time STT

**Implementation**:
```typescript
// src/voice/gpu-acceleration.ts
export interface GPUConfig {
  backend: 'cuda' | 'metal' | 'vulkan' | 'openvino' | 'cpu';
  device: number;
  maxMemory: number;
}

export function detectGPU(): GPUConfig {
  // Auto-detect available GPU
  if (process.platform === 'darwin') {
    return { backend: 'metal', device: 0, maxMemory: 4096 };
  }
  if (hasNVIDIA()) {
    return { backend: 'cuda', device: 0, maxMemory: 4096 };
  }
  return { backend: 'cpu', device: 0, maxMemory: 2048 };
}

export async function enableGPU(
  whisperPath: string,
  config: GPUConfig
): Promise<boolean> {
  const args = [
    '-m', `${whisperPath}/ggml-${config.backend}.bin`,
    '-l', 'auto',
    '-t', '4',
    '--gpu-layers', '32'
  ];
  
  // Spawn whisper with GPU flags
  return spawnWhisper(args);
}
```

**Hardware Support**:
| GPU | Platform | Speedup | Notes |
|-----|----------|---------|-------|
| NVIDIA RTX | CUDA | 10-20x | Best option |
| Apple Silicon | Metal | 5-10x | M1/M2/M3 |
| AMD/Intel | Vulkan | 3-5x | Cross-platform |
| Intel | OpenVINO | 2-4x | Integrated graphics |

**User Command**:
```bash
dirgha voice --gpu          # Auto-detect and enable GPU
dirgha voice --gpu=metal    # Force Metal (macOS)
dirgha voice --gpu=cuda     # Force CUDA (NVIDIA)
```

---

### 2. Model Quantization ⭐ HIGH PRIORITY

**Objective**: Reduce model size and RAM usage by 50-75%

**Quantization Levels**:
| Level | Precision | Size Reduction | Quality Impact |
|-------|-----------|----------------|----------------|
| F16 | Half-precision | 50% | Minimal |
| Q8_0 | 8-bit | 75% | Slight |
| Q5_0 | 5-bit | 81% | Moderate |
| Q4_0 | 4-bit | 87% | Noticeable |

**Implementation**:
```typescript
// src/models/quantization.ts
export interface QuantizedModel {
  originalId: string;
  quantizedId: string;
  bits: 16 | 8 | 5 | 4;
  sizeMB: number;
  quality: 'high' | 'medium' | 'low';
}

export const QUANTIZED_MODELS: QuantizedModel[] = [
  {
    originalId: 'whisper-base',
    quantizedId: 'whisper-base-q8_0',
    bits: 8,
    sizeMB: 71,  // 142MB → 71MB
    quality: 'high'
  },
  {
    originalId: 'gemma4-4b',
    quantizedId: 'gemma4-4b-q4_0',
    bits: 4,
    sizeMB: 700,  // 2.8GB → 700MB
    quality: 'medium'
  }
];

export async function downloadQuantized(
  modelId: string,
  bits: number
): Promise<void> {
  const quantized = QUANTIZED_MODELS.find(
    m => m.originalId === modelId && m.bits === bits
  );
  
  if (!quantized) {
    throw new Error(`No ${bits}-bit version of ${modelId}`);
  }
  
  await downloadModel(quantized.quantizedId);
}
```

**User Commands**:
```bash
dirgha models list --quantized              # Show quantized options
dirgha models download gemma4-4b-q4_0      # Download 4-bit version
dirgha voice --model=gemma4-4b-q4_0       # Use quantized model
```

**Auto-Detection**:
```typescript
// Auto-select quantization based on available RAM
function autoSelectQuantization(availableRAM: number): number {
  if (availableRAM > 8) return 16;    // F16
  if (availableRAM > 4) return 8;   // Q8
  if (availableRAM > 2) return 5;   // Q5
  return 4;                          // Q4
}
```

---

### 3. Audio Buffering Optimization

**Objective**: Reduce latency by processing audio in chunks

**Current Approach**:
- Record entire audio → Save to file → Transcribe
- Latency: 3-5s for 10s audio

**Optimized Approach**:
- Stream audio chunks → Process in real-time
- Latency: <2s with streaming

**Implementation**:
```typescript
// src/voice/streaming.ts
export interface AudioChunk {
  data: Float32Array;
  timestamp: number;
  isLast: boolean;
}

export class StreamingTranscriber {
  private whisperProcess: ChildProcess;
  private chunks: AudioChunk[] = [];
  
  async startStream(): Promise<void> {
    // Start whisper in streaming mode
    this.whisperProcess = spawn('whisper', [
      '-m', MODEL_PATH,
      '-l', 'auto',
      '--stream',  // Real-time mode
      '--step', '1000',  // Process every 1s
      '--length', '10000'  // 10s buffer
    ]);
    
    this.whisperProcess.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        this.emit('partial', text);  // Real-time feedback
      }
    });
  }
  
  async feedChunk(chunk: AudioChunk): Promise<void> {
    this.whisperProcess.stdin?.write(chunk.data.buffer);
  }
  
  async endStream(): Promise<string> {
    this.whisperProcess.stdin?.end();
    return new Promise((resolve) => {
      let fullText = '';
      this.whisperProcess.stdout?.on('data', (data) => {
        fullText += data.toString();
      });
      this.whisperProcess.on('close', () => {
        resolve(fullText.trim());
      });
    });
  }
}
```

**User Experience**:
```
🎤 Recording...
   Heard: "Create a"           ← Real-time preview
   Heard: "Create a React"
   Heard: "Create a React component"
✓ Transcription: "Create a React component for login"
```

---

### 4. Parallel Processing Pipeline

**Objective**: Overlap STT, LLM, and TTS for faster responses

**Current Pipeline (Sequential)**:
```
Audio → STT (2s) → LLM (3s) → TTS (1s) → Play (6s total)
```

**Optimized Pipeline (Parallel)**:
```
Audio → STT (2s) ─┬→ LLM (3s) ─┬→ TTS (1s) → Play (4s total)
                   └→ Predict TTS (overlap)
```

**Implementation**:
```typescript
// src/voice/pipeline.ts
export class VoicePipeline {
  private stt: StreamingTranscriber;
  private llm: LocalLLM;
  private tts: PiperTTS;
  
  async processVoiceCommand(audio: AudioBuffer): Promise<void> {
    // Step 1: STT (streaming)
    const transcription$ = this.stt.transcribeStreaming(audio);
    
    // Step 2: LLM (starts as soon as we have partial text)
    let partialText = '';
    transcription$.subscribe(async (text) => {
      partialText += text;
      
      // If we detect a complete command, start LLM early
      if (this.isCompleteCommand(partialText)) {
        const llmPromise = this.llm.generate(partialText);
        
        // Step 3: TTS (streaming synthesis)
        llmPromise.then(response => {
          this.tts.speakStreaming(response);
        });
      }
    });
  }
  
  private isCompleteCommand(text: string): boolean {
    // Detect sentence boundaries
    return /[.!?]$/.test(text.trim()) || text.length > 50;
  }
}
```

---

### 5. Memory Management

**Objective**: Keep RAM usage under 2GB during voice operations

**Strategies**:

**A. LRU Cache for Models**:
```typescript
// src/models/cache.ts
import LRUCache from 'lru-cache';

const modelCache = new LRUCache<string, LoadedModel>({
  max: 2,  // Keep only 2 models in RAM
  maxSize: 2 * 1024 * 1024 * 1024,  // 2GB max
  sizeCalculation: (model) => model.sizeBytes,
  dispose: (model) => model.unload()  // Free GPU/CPU memory
});

export async function loadModel(modelId: string): Promise<LoadedModel> {
  if (modelCache.has(modelId)) {
    return modelCache.get(modelId)!;
  }
  
  const model = await loadFromDisk(modelId);
  modelCache.set(modelId, model);
  return model;
}
```

**B. Memory Pressure Detection**:
```typescript
// src/utils/memory.ts
export function checkMemoryPressure(): 'none' | 'low' | 'high' | 'critical' {
  const used = process.memoryUsage();
  const total = os.totalmem();
  const percent = (used.heapUsed / total) * 100;
  
  if (percent > 80) return 'critical';
  if (percent > 60) return 'high';
  if (percent > 40) return 'low';
  return 'none';
}

export async function handleMemoryPressure(): Promise<void> {
  const pressure = checkMemoryPressure();
  
  if (pressure === 'critical') {
    // Emergency: unload all models
    await unloadAllModels();
  } else if (pressure === 'high') {
    // Reduce cache size
    modelCache.resize(1);
  }
}
```

**C. Background Garbage Collection**:
```typescript
// Force GC between voice sessions
if (global.gc) {
  global.gc();
}
```

---

### 6. Model Preloading

**Objective**: Reduce "first voice" latency by preloading models

**Implementation**:
```typescript
// src/voice/preload.ts
export class ModelPreloader {
  private preloadedModels: Set<string> = new Set();
  
  async preloadDefaultModels(): Promise<void> {
    const defaults = ['whisper-base', 'gemma4-2b-q8_0'];
    
    for (const modelId of defaults) {
      console.log(`Preloading ${modelId}...`);
      await loadModel(modelId);
      this.preloadedModels.add(modelId);
    }
    
    console.log('✓ Models ready for instant voice');
  }
  
  async preloadOnIdle(): Promise<void> {
    // Preload when system is idle
    setTimeout(() => {
      this.preloadDefaultModels();
    }, 5000);  // 5s after startup
  }
}

// CLI command
export async function preloadCommand(): Promise<void> {
  const preloader = new ModelPreloader();
  await preloader.preloadDefaultModels();
}
```

**User Command**:
```bash
dirgha voice --preload    # Preload models at startup
dirgha models preload     # Explicit preload command
```

---

### 7. Lazy Loading Components

**Objective**: Only load voice components when needed

**Implementation**:
```typescript
// src/voice/index.ts
let voiceRecorder: DesktopVoiceRecorder | null = null;

export async function getVoiceRecorder(): Promise<DesktopVoiceRecorder> {
  if (!voiceRecorder) {
    voiceRecorder = new DesktopVoiceRecorder();
    await voiceRecorder.initialize();
  }
  return voiceRecorder;
}

// Lazy load TTS
let ttsEngine: PiperTTS | null = null;

export async function getTTS(): Promise<PiperTTS> {
  if (!ttsEngine) {
    ttsEngine = new PiperTTS();
    await ttsEngine.loadVoice('amy');
  }
  return ttsEngine;
}
```

---

## 📊 Benchmarking Plan

### Benchmark Suite
```typescript
// tests/benchmarks/performance.test.ts
describe('Performance Benchmarks', () => {
  it('should transcribe 10s audio in <2s', async () => {
    const audio = loadTestAudio('10s-sample.wav');
    const start = performance.now();
    await transcribe(audio);
    const latency = performance.now() - start;
    expect(latency).toBeLessThan(2000);
  });
  
  it('should use <2GB RAM during voice', async () => {
    const before = process.memoryUsage().heapUsed;
    await runVoiceSession();
    const after = process.memoryUsage().heapUsed;
    const used = (after - before) / 1024 / 1024;
    expect(used).toBeLessThan(2048);  // 2GB
  });
  
  it('should switch models in <3s', async () => {
    const start = performance.now();
    await switchModel('whisper-small');
    const latency = performance.now() - start;
    expect(latency).toBeLessThan(3000);
  });
});
```

### Benchmarking Commands
```bash
# Run all benchmarks
dirgha benchmark voice

# Specific benchmarks
dirgha benchmark stt --model=base
dirgha benchmark stt --model=small --gpu
dirgha benchmark llm --model=gemma4-2b
dirgha benchmark ram --duration=60
```

---

## 🎯 Success Criteria

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| STT Latency | ~5s | <2s | 🎯 Target |
| RAM Usage | ~4GB | <2GB | 🎯 Target |
| Model Switch | Unknown | <3s | 🎯 Target |
| First Response | Unknown | <5s | 🎯 Target |
| GPU Speedup | 1x (CPU) | 5-20x | 🎯 Target |
| Model Size | 3GB | <1GB (Q4) | 🎯 Target |

---

## 📁 Implementation Files

```
src/
├── voice/
│   ├── gpu-acceleration.ts     # GPU detection & enablement
│   ├── streaming.ts            # Real-time audio processing
│   ├── pipeline.ts             # Parallel STT→LLM→TTS
│   ├── preload.ts              # Model preloading
│   └── __tests__/
│       └── performance.test.ts   # Benchmarks
├── models/
│   ├── quantization.ts         # Model compression
│   ├── cache.ts                # LRU model cache
│   └── __tests__/
│       └── quantization.test.ts
└── utils/
    └── memory.ts               # Memory pressure detection
```

---

## 🚀 Implementation Order

1. **Week 1**: GPU acceleration (biggest impact)
2. **Week 2**: Model quantization (RAM reduction)
3. **Week 3**: Streaming STT (latency reduction)
4. **Week 4**: Parallel pipeline & memory management

---

**Status**: Documentation complete, implementation ready to begin when testing unblocked  
**Estimated Time**: 4 weeks  
**Risk**: GPU drivers may vary by hardware

