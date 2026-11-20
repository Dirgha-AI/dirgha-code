// Dirgha v2 — Firefox/Chrome MV3 Background Service Worker, In-Browser WASM Gate & Native Host Bridge
// Loads `lokahi_gate.wasm` (`lokahi_c_abi_evaluate_utf8`) directly in the browser extension and bridges to `ai.dirgha.native_host`.

const runtimeApi = globalThis.browser?.runtime || globalThis.chrome?.runtime;
const NATIVE_HOST_ID = "ai.dirgha.native_host";

let wasmInstancePromise = null;

/**
 * Instantiate `lokahi_gate.wasm` inside the MV3 Service Worker for `<1 ms` local C-ABI pre-filtering.
 */
async function getLokahiWasmExports() {
  if (wasmInstancePromise) return wasmInstancePromise;
  wasmInstancePromise = (async () => {
    try {
      const wasmUrl = runtimeApi?.getURL ? runtimeApi.getURL("lokahi_gate.wasm") : "lokahi_gate.wasm";
      const resp = await fetch(wasmUrl);
      const bytes = await resp.arrayBuffer();
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
      return instance.exports;
    } catch (_err) {
      return null;
    }
  })();
  return wasmInstancePromise;
}

/**
 * Evaluate a UTF-8 command/URL payload locally in `<1 ms` using `lokahi_gate.wasm`.
 */
async function evaluateLocalWasmGate(payload, isS2Critical = false) {
  const exports = await getLokahiWasmExports();
  if (!exports || !exports.lokahi_c_abi_evaluate_utf8 || !exports.memory) {
    return null;
  }
  const encoded = new TextEncoder().encode(payload);
  const scratchOffset = 65536;
  const view = new Uint8Array(exports.memory.buffer, scratchOffset, encoded.length);
  view.set(encoded);
  const code = exports.lokahi_c_abi_evaluate_utf8(scratchOffset, encoded.length, isS2Critical ? 1 : 0);
  return code === 1;
}

/**
 * Send a JSON-RPC 2.0 request to the Rust `dirgha-native-host` binary over Native Messaging.
 */
async function callNativeKernel(method, params) {
  if (!runtimeApi || !runtimeApi.sendNativeMessage) {
    throw new Error("WebExtensions nativeMessaging permission not available");
  }
  return runtimeApi.sendNativeMessage(NATIVE_HOST_ID, {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  });
}

/**
 * Execute an authenticated in-session fetch (`fetch_via_session`, harvested from Traycer `traycer-browser`),
 * gated first by in-browser `lokahi_gate.wasm` and then logged in the Rust micro-kernel `AuditLedger`.
 */
async function fetchViaSession(url, options = {}) {
  const payload = `${options.method || "GET"} ${url}`;
  const isS2 = Boolean(options.method && options.method !== "GET");

  // 1. Fast `<1 ms` in-browser WASM pre-check
  const wasmAllowed = await evaluateLocalWasmGate(payload, isS2 && !options.humanApproved);
  if (wasmAllowed === false) {
    return {
      ok: false,
      blocked_by_lokahi_wasm: true,
      verdict: { Deny: { rule_id: "LOKAHI-WASM-C-ABI", reason: "Blocked by in-browser lokahi_gate.wasm" } },
    };
  }

  // 2. Native Host verification + BLAKE3/Ed25519 audit ledger append
  const gateCheck = await callNativeKernel("lokahi_verify_action", {
    tool_name: "fetch_via_session",
    payload,
    safety_class: isS2 ? "S2HardwareOrCritical" : "S0ReadOnly",
    human_signature_verified: Boolean(options.humanApproved),
    approval_wait_ms: options.waitedMs || 0,
    joint_velocity_rad_s: null,
    max_joint_velocity_limit: null,
  });

  if (!gateCheck?.result?.allowed) {
    return {
      ok: false,
      blocked_by_lokahi: true,
      verdict: gateCheck?.result?.verdict,
    };
  }

  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body,
    credentials: "include",
  });
  const bodyText = await resp.text();
  return {
    ok: resp.ok,
    status: resp.status,
    bodyText,
  };
}

if (runtimeApi && runtimeApi.onMessage) {
  runtimeApi.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "DIRGHA_FETCH_VIA_SESSION") {
      fetchViaSession(msg.url, msg.options).then(sendResponse);
      return true;
    }
    if (msg.type === "DIRGHA_WASM_RED_TEAM_50") {
      getLokahiWasmExports().then((exp) => {
        const score = exp?.lokahi_wasm_run_red_team_50 ? exp.lokahi_wasm_run_red_team_50() : -1;
        sendResponse({ ok: score === 50, passed: score });
      });
      return true;
    }
    if (msg.type === "DIRGHA_RPC") {
      callNativeKernel(msg.method, msg.params).then(sendResponse);
      return true;
    }
    return false;
  });
}
