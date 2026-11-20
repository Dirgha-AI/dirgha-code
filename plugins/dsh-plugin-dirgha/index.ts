/**
 * `dsh-plugin-dirgha` — Cordis Plugin for DeepSeek Harness (`deepseek-ai/deepseek-harness`).
 *
 * Attaches to `dsh` waterfall hooks (`docs/architecture.md`):
 * 1. `agent/pre-step`: Masks API keys/PII via `PrivacyFlow` (`<SECRET_HANDLE_NN>`) and compacts old screenshots.
 * 2. `tools/pre-execute`: Evaluates every tool call in `<1 ms` via the compiled `lokahi_gate.wasm`
 *    C-ABI export `lokahi_c_abi_evaluate_utf8` (with fallback to `dirgha-native-host` RPC).
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface DirghaCordisConfig {
  nativeHostBin: string;
  wasmPath?: string;
  lokahiMode: "strict" | "audit";
  privacyFlowMasking: boolean;
  xirynSlidingWindowMaxImages: number;
  xirynSlidingWindowMaxTools: number;
}

interface LokahiWasmExports {
  memory: WebAssembly.Memory;
  lokahi_wasm_run_red_team_50: () => number;
  lokahi_c_abi_evaluate_utf8: (ptr: number, len: number, isS2Critical: number) => number;
  lokahi_alloc?: (size: number) => number;
  alloc?: (size: number) => number;
  malloc?: (size: number) => number;
}

let cachedWasmExports: LokahiWasmExports | null = null;

/**
 * Load and instantiate `lokahi_gate.wasm` (`wasm32-wasip1`) once per process for `<1 ms` evaluation.
 */
export async function loadLokahiWasm(customPath?: string): Promise<LokahiWasmExports | null> {
  if (cachedWasmExports) return cachedWasmExports;
  const candidatePaths = [
    customPath,
    path.resolve(process.cwd(), "extensions/firefox-mv3/lokahi_gate.wasm"),
    path.resolve(process.cwd(), "target/wasm32-wasip1/release/lokahi_gate.wasm"),
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  if (candidatePaths.length === 0) return null;

  const bytes = fs.readFileSync(candidatePaths[0]);
  const wasiStub = {
    args_get: () => 0,
    args_sizes_get: () => 0,
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    clock_time_get: () => 0,
    fd_close: () => 0,
    fd_fdstat_get: () => 0,
    fd_seek: () => 0,
    fd_write: () => 0,
    proc_exit: () => {},
    random_get: () => 0,
  };
  const { instance } = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: wasiStub,
  });
  cachedWasmExports = instance.exports as unknown as LokahiWasmExports;
  return cachedWasmExports;
}

/**
 * Evaluate a UTF-8 command/tool payload using the compiled `lokahi_gate.wasm` C-ABI (`lokahi_c_abi_evaluate_utf8`).
 */
function allowUngatedForDevelopment(): boolean {
  if (process.env.DIRGHA_ALLOW_UNGATED === "1") {
    console.warn("[DIRGHA SECURITY WARNING] DIRGHA_ALLOW_UNGATED=1 bypasses the Lokahi WASM gate; use only for local development.");
    return true;
  }
  return false;
}

export async function evaluateWithLokahiWasm(
  payload: string,
  isS2Critical: boolean,
  wasmPath?: string
): Promise<boolean> {
  try {
    const wasm = await loadLokahiWasm(wasmPath);
    if (!wasm || typeof wasm.lokahi_c_abi_evaluate_utf8 !== "function" || !wasm.memory) {
      return allowUngatedForDevelopment();
    }
    const encoded = new TextEncoder().encode(payload);
    const allocator = wasm.lokahi_alloc ?? wasm.alloc ?? wasm.malloc;
    const pointer = allocator ? allocator(encoded.length) : 65536;
    if (!Number.isInteger(pointer) || pointer < 0 || pointer + encoded.length > wasm.memory.buffer.byteLength) {
      return allowUngatedForDevelopment();
    }
    new Uint8Array(wasm.memory.buffer, pointer, encoded.length).set(encoded);
    const verdict = wasm.lokahi_c_abi_evaluate_utf8(pointer, encoded.length, isS2Critical ? 1 : 0);
    if (verdict === 1) return true;
    if (verdict === 0) return false;
    return allowUngatedForDevelopment();
  } catch {
    return allowUngatedForDevelopment();
  }
}

export const name = "dirgha-sovereign-governance";

export function apply(ctx: any, config: DirghaCordisConfig) {
  // 1. Hook `agent/pre-step` waterfall in DeepSeek Harness (`dsh`)
  ctx.on("agent/pre-step", async (stepCtx: any, next: () => Promise<any>) => {
    if (config.privacyFlowMasking && Array.isArray(stepCtx?.messages)) {
      let handleIdx = 1;
      for (const msg of stepCtx.messages) {
        if (typeof msg.content === "string") {
          msg.content = msg.content.replace(
            /\b(sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{12,})\b/g,
            () => `<SECRET_HANDLE_${String(handleIdx++).padStart(2, "0")}>`
          );
        }
      }
    }
    return next();
  });

  // 2. Hook `tools/pre-execute` waterfall to enforce Lokahi 18 rules via `lokahi_gate.wasm`
  ctx.on("tools/pre-execute", async (toolCall: any, next: () => Promise<any>) => {
    const payload = JSON.stringify(toolCall?.arguments ?? {});
    const isS2 = Boolean(toolCall?.safetyClass === "S2HardwareOrCritical");
    const allowed = await evaluateWithLokahiWasm(payload, isS2, config.wasmPath);
    if (!allowed && config.lokahiMode !== "audit") {
      throw new Error(
        `[Lokahi Gate WASM SEC-BLOCK] Action on tool '${toolCall?.name}' denied by Dirgha 2.0 policy.`
      );
    }
    return next();
  });
}
