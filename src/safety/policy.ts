/**
 * Policy engine. Evaluates a PermissionCheck against an ordered rule
 * list and returns a decision (allow / deny / require_approval). The
 * default ruleset ships in-code; user and project rules are merged at
 * config load time.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PermissionCheck,
  PermissionDecision,
} from "../tools/permission.js";

// Minimal WebAssembly types. tsconfig uses lib es2022 without DOM, so the
// global WebAssembly namespace is not typed; Node provides it at runtime.
interface LokahiWasmMemory { buffer: ArrayBuffer; grow(delta: number): number }
interface LokahiWasmApi {
  Module: new (bytes: ArrayBufferView | ArrayBuffer) => object;
  Instance: new (mod: object, imports: Record<string, Record<string, unknown>>) => { exports: Record<string, unknown> };
}
const WasmApi = (globalThis as unknown as { WebAssembly: LokahiWasmApi }).WebAssembly;

export interface LokahiWasmSyncExports {
  memory: LokahiWasmMemory;
  lokahi_c_abi_evaluate_utf8: (ptr: number, len: number, isS2Critical: number) => number;
  lokahi_alloc?: (size: number) => number;
  alloc?: (size: number) => number;
  malloc?: (size: number) => number;
}

export interface LokahiGateResult {
  allowed: boolean;
  reason: string;
}

let cachedLokahiSync: LokahiWasmSyncExports | null | undefined;

function getLokahiWasmSync(): LokahiWasmSyncExports | null {
  if (cachedLokahiSync !== undefined) return cachedLokahiSync;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootDir = resolve(here, "..", "..");
    const wasmPath = join(rootDir, "extensions", "firefox-mv3", "lokahi_gate.wasm");
    if (!existsSync(wasmPath)) {
      cachedLokahiSync = null;
      return null;
    }
    const bytes = readFileSync(wasmPath);
    const mod = new WasmApi.Module(bytes);
    const inst = new WasmApi.Instance(mod, {
      wasi_snapshot_preview1: {
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
      },
    });
    cachedLokahiSync = inst.exports as unknown as LokahiWasmSyncExports;
    return cachedLokahiSync;
  } catch {
    cachedLokahiSync = null;
    return null;

  }
}

function allowUngatedForDevelopment(): boolean {
  if (process.env.DIRGHA_ALLOW_UNGATED === "1") {
    console.warn("[DIRGHA SECURITY WARNING] DIRGHA_ALLOW_UNGATED=1 bypasses the Lokahi WASM gate; use only for local development.");
    return true;
  }
  return false;
}

/** Evaluate the WASM gate and fail closed for missing, malformed, throwing, or unknown verdicts. */
export function evaluateLokahiGateSync(
  payload: string,
  isS2Critical: boolean,
  wasmOrLoader?: LokahiWasmSyncExports | null | (() => LokahiWasmSyncExports | null),
): LokahiGateResult {
  try {
    const wasm = typeof wasmOrLoader === "function"
      ? wasmOrLoader()
      : wasmOrLoader === undefined ? getLokahiWasmSync() : wasmOrLoader;
    if (!wasm || typeof wasm.lokahi_c_abi_evaluate_utf8 !== "function" || !wasm.memory) {
      return allowUngatedForDevelopment()
        ? { allowed: true, reason: "lokahi_gate_unavailable_opt_out" }
        : { allowed: false, reason: "lokahi_gate_unavailable" };
    }
    const encoded = new TextEncoder().encode(payload);
    const allocator = wasm.lokahi_alloc ?? wasm.alloc ?? wasm.malloc;
    const pointer = allocator ? allocator(encoded.length) : 65536;
    if (!Number.isInteger(pointer) || pointer < 0 || pointer + encoded.length > wasm.memory.buffer.byteLength) {
      return allowUngatedForDevelopment()
        ? { allowed: true, reason: "lokahi_gate_memory_unavailable_opt_out" }
        : { allowed: false, reason: "lokahi_gate_memory_unavailable" };
    }
    new Uint8Array(wasm.memory.buffer, pointer, encoded.length).set(encoded);
    const verdict = wasm.lokahi_c_abi_evaluate_utf8(pointer, encoded.length, isS2Critical ? 1 : 0);
    if (verdict === 1) return { allowed: true, reason: "lokahi_gate_allow" };
    if (verdict === 0) return { allowed: false, reason: "lokahi_gate_denied" };
    return allowUngatedForDevelopment()
      ? { allowed: true, reason: "lokahi_gate_unknown_opt_out" }
      : { allowed: false, reason: "lokahi_gate_unavailable" };
  } catch {
    return allowUngatedForDevelopment()
      ? { allowed: true, reason: "lokahi_gate_error_opt_out" }
      : { allowed: false, reason: "lokahi_gate_unavailable" };
  }
}

export interface PolicyRule {
  id: string;
  applies: { tools?: string[]; actions?: PermissionCheck["action"][] };
  when?: PolicyCondition;
  effect: "allow" | "deny" | "require_approval";
  reason: string;
}

export interface PolicyCondition {
  pathMatches?: string; // glob relative to cwd
  commandMatches?: string; // regex against target
  outsideCwd?: boolean;
  startsWith?: string;
}

export interface PolicyEngineOptions {
  cwd: string;
  rules?: PolicyRule[];
}

export interface PolicyEngine {
  evaluate(req: PermissionCheck): PermissionDecision;
}

export const DEFAULT_RULES: PolicyRule[] = [
  {
    id: "read-inside-cwd",
    applies: { actions: ["read"] },
    when: { outsideCwd: false },
    effect: "allow",
    reason:
      "reads inside the working directory are permitted without prompting",
  },
  {
    id: "read-outside-cwd",
    applies: { actions: ["read"] },
    when: { outsideCwd: true },
    effect: "require_approval",
    reason: "reading outside the working directory requires approval",
  },
  {
    id: "write-inside-cwd",
    applies: { actions: ["write"] },
    when: { outsideCwd: false },
    effect: "require_approval",
    reason: "writes inside the working directory require approval",
  },
  {
    id: "write-outside-cwd",
    applies: { actions: ["write"] },
    when: { outsideCwd: true },
    effect: "deny",
    reason: "writes outside the working directory are forbidden by default",
  },
  {
    id: "delete",
    applies: { actions: ["delete"] },
    effect: "require_approval",
    reason: "deletions require approval",
  },
  {
    id: "exec-danger-force",
    applies: { actions: ["exec"] },
    when: {
      commandMatches:
        "(?:rm -rf|git push --force|git reset --hard|DROP TABLE|kubectl delete)",
    },
    effect: "require_approval",
    reason: "potentially destructive command requires explicit approval",
  },
  {
    id: "exec-default",
    applies: { actions: ["exec"] },
    effect: "require_approval",
    reason: "shell execution requires approval",
  },
  {
    id: "network-default",
    applies: { actions: ["network"] },
    effect: "require_approval",
    reason: "network access requires approval",
  },
];

export function createPolicyEngine(opts: PolicyEngineOptions): PolicyEngine {
  const cwd = resolve(opts.cwd);
  const rules = [...(opts.rules ?? []), ...DEFAULT_RULES];

  const evaluate = (req: PermissionCheck): PermissionDecision => {
    // The WASM capability firewall is mandatory unless the explicit local-development opt-out is set.
    const gate = evaluateLokahiGateSync(req.target, false);
    if (!gate.allowed && gate.reason !== "lokahi_gate_denied") {
      return { allowed: false, reason: gate.reason, requiresApproval: false };
    }
    if (!gate.allowed) {
      return {
        allowed: false,
        reason: "lokahi-gate-wasm: blocked by the WebAssembly safety gate",
        requiresApproval: false,
      };
    }
    for (const rule of rules) {
      if (!appliesTo(rule, req)) continue;
      if (!conditionMatches(rule.when, req, cwd)) continue;
      return decisionFor(rule);
    }
    return {
      allowed: true,
      reason: "default catch-all allow-with-approval",
      requiresApproval: true,
    };
  };

  return { evaluate };
}

function appliesTo(rule: PolicyRule, req: PermissionCheck): boolean {
  if (rule.applies.tools && !rule.applies.tools.includes(req.tool))
    return false;
  if (rule.applies.actions && !rule.applies.actions.includes(req.action))
    return false;
  return true;
}

function conditionMatches(
  cond: PolicyCondition | undefined,
  req: PermissionCheck,
  cwd: string,
): boolean {
  if (!cond) return true;
  if (cond.outsideCwd !== undefined) {
    const inside = isInside(cwd, req.target, cwd);
    if (cond.outsideCwd && inside) return false;
    if (!cond.outsideCwd && !inside) return false;
  }
  if (cond.commandMatches) {
    try {
      const rx = new RegExp(cond.commandMatches);
      if (!rx.test(req.target)) return false;
    } catch {
      return false;
    }
  }
  if (cond.startsWith && !req.target.startsWith(cond.startsWith)) return false;
  return true;
}

function decisionFor(rule: PolicyRule): PermissionDecision {
  switch (rule.effect) {
    case "allow":
      return {
        allowed: true,
        reason: `${rule.id}: ${rule.reason}`,
        requiresApproval: false,
      };
    case "deny":
      return {
        allowed: false,
        reason: `${rule.id}: ${rule.reason}`,
        requiresApproval: false,
      };
    case "require_approval":
      return {
        allowed: true,
        reason: `${rule.id}: ${rule.reason}`,
        requiresApproval: true,
      };
  }
}

function isInside(root: string, target: string, cwd: string): boolean {
  if (!target) return false;
  const resolved = resolve(cwd, target);
  const normRoot = root.replace(/\/+$/, "");
  return resolved === normRoot || resolved.startsWith(`${normRoot}/`);
}
