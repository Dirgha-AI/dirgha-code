import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, runWasmSelfCheck, resolveNativeBinary } from "./dirgha.mjs";
import { createPolicyEngine } from "../dist/safety/policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, "dirgha.mjs");

test("lokahi_gate.wasm executes 50/50 red-team and C-ABI checks in Node WebAssembly", async () => {
  const res = await runWasmSelfCheck();
  assert.equal(res.wasmFound, true);
  assert.equal(res.redTeamPassed, 50);
  assert.equal(res.cAbiVerified, true);
});

test("v1 policy engine (dist/safety/policy.js) is upgraded with <1ms lokahi_gate.wasm firewall", () => {
  const engine = createPolicyEngine({ cwd: process.cwd() });

  // Flag-permuted rm -fr / (bypassed old v1 regex, now blocked by Lokahi WASM C-ABI)
  const blockedPermuted = engine.evaluate({
    tool: "shell",
    action: "exec",
    target: "sudo rm -fr /",
  });
  assert.equal(blockedPermuted.allowed, false);
  assert.ok(blockedPermuted.reason.includes("lokahi-gate-wasm"));

  // Cloud metadata SSRF (blocked by Lokahi WASM C-ABI)
  const blockedSsrf = engine.evaluate({
    tool: "shell",
    action: "network",
    target: "curl http://169.254.169.254/latest/meta-data/",
  });
  assert.equal(blockedSsrf.allowed, false);
  assert.ok(blockedSsrf.reason.includes("lokahi-gate-wasm"));
});

test("dirgha doctor reports HEALTHY, v1 coding CLI integrated, and <25 MB native binary gate", async () => {
  const rep = await runDoctor();
  assert.equal(rep.status, "HEALTHY");
  assert.equal(rep.v1_coding_cli_integrated, true);
  assert.equal(rep.lokahi_wasm_gate.lokahi_50_red_team, "50/50 PASS");
  assert.equal(rep.rust_native_host.under_25mb_gate, true);
  assert.ok(rep.provider_router.opencode_catalog_providers >= 38);
});

test("unified CLI routes both v1 coding commands (hardware, status) and v2 kernel commands (--self-test, cockpit)", () => {
  const ver = execFileSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" }).trim();
  assert.equal(ver, "@dirgha/code 2.0.0");

  // Verify v1 subcommand (`dirgha hardware --json`) routes cleanly through `dist/cli/main.js`
  const hwRaw = execFileSync(process.execPath, [cliPath, "hardware", "--json"], { encoding: "utf8" });
  const hwParsed = JSON.parse(hwRaw);
  assert.ok(hwParsed.hardware.cpuCores >= 1);
  assert.ok(Array.isArray(hwParsed.recommended));

  if (resolveNativeBinary()) {
    const selfTestRaw = execFileSync(process.execPath, [cliPath, "--self-test"], { encoding: "utf8" });
    const parsed = JSON.parse(selfTestRaw);
    assert.equal(parsed.status, "PASS");
    assert.equal(parsed.lokahi_50_all_passed, true);
    assert.equal(parsed.mcp_tools_registered, 24);

    const serveOnceRaw = execFileSync(process.execPath, [cliPath, "cockpit", "--serve", "--once"], {
      encoding: "utf8",
    });
    const serveParsed = JSON.parse(serveOnceRaw);
    assert.equal(serveParsed.status, "PASS");
    assert.equal(serveParsed.pwa_manifest_verified, true);
  }
});
