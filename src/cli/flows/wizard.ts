/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Designed as the first thing a new user sees. Replaces the older
 * one-step "pick provider, paste key" form with a clear:
 *   1. Pick a provider (Dirgha hosted is option 1; BYOK options follow)
 *   2. Authenticate (device-code for Dirgha, hidden-input for BYOK)
 *   3. Pick a default model from that provider's catalogue
 *
 * Auto-launched by `bin/dirgha` on first run when neither
 * `~/.dirgha/keys.json` nor `~/.dirgha/credentials.json` exists.
 *
 * Non-TTY: prints a static how-to instead of prompting (CI-safe).
 */

import { stdin, stdout } from "node:process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultTheme, style } from "../../tui/theme.js";
import {
  pollDeviceAuth,
  saveToken,
  startDeviceAuth,
} from "../../integrations/device-auth.js";
import { PRICES } from "../../intelligence/prices.js";
import type { Subcommand } from "../subcommands/index.js";

interface ProviderChoice {
  id: string;
  label: string;
  hosted: boolean;
  env?: string;
  helpUrl?: string;
  blurb: string;
}

export const PROVIDERS: ProviderChoice[] = [
  {
    id: "dirgha",
    label: "Dirgha hosted",
    hosted: true,
    blurb: "Sign in with your Dirgha account · paid plans (no free tier)",
  },
  {
    id: "local",
    label: "Local (llama.cpp / Ollama)",
    hosted: false,
    blurb: "Run models on your own machine · zero cost, fully private",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    hosted: false,
    env: "NVIDIA_API_KEY",
    helpUrl: "https://build.nvidia.com/settings/api-keys",
    blurb: "Free NIM tier · Kimi, DeepSeek, Qwen, Llama",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hosted: false,
    env: "OPENROUTER_API_KEY",
    helpUrl: "https://openrouter.ai/keys",
    blurb: "Hundreds of models · free + paid · :free suffix tier",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hosted: false,
    env: "ANTHROPIC_API_KEY",
    helpUrl: "https://console.anthropic.com/settings/keys",
    blurb: "Claude family — Opus, Sonnet, Haiku",
  },
  {
    id: "openai",
    label: "OpenAI",
    hosted: false,
    env: "OPENAI_API_KEY",
    helpUrl: "https://platform.openai.com/api-keys",
    blurb: "GPT family",
  },
  {
    id: "gemini",
    label: "Gemini",
    hosted: false,
    env: "GEMINI_API_KEY",
    helpUrl: "https://aistudio.google.com/apikey",
    blurb: "Google's models",
  },
  {
    id: "fireworks",
    label: "Fireworks",
    hosted: false,
    env: "FIREWORKS_API_KEY",
    helpUrl: "https://fireworks.ai/account/api-keys",
    blurb: "Fast hosted open models",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hosted: false,
    env: "DEEPSEEK_API_KEY",
    helpUrl: "https://platform.deepseek.com/api_keys",
    blurb: "DeepSeek V4, R1, Chat — native API",
  },
  // ─── 1.10.1: extra providers ───────────────────────────────────────
  {
    id: "mistral",
    label: "Mistral",
    hosted: false,
    env: "MISTRAL_API_KEY",
    helpUrl: "https://console.mistral.ai/api-keys",
    blurb: "Mistral, Codestral, Magistral",
  },
  {
    id: "cohere",
    label: "Cohere",
    hosted: false,
    env: "COHERE_API_KEY",
    helpUrl: "https://dashboard.cohere.com/api-keys",
    blurb: "Command R / Command A — RAG-tuned",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    hosted: false,
    env: "CEREBRAS_API_KEY",
    helpUrl: "https://cloud.cerebras.ai/platform/keys",
    blurb: "Wafer-scale inference, very fast",
  },
  {
    id: "together",
    label: "Together AI",
    hosted: false,
    env: "TOGETHER_API_KEY",
    helpUrl: "https://api.together.ai/settings/api-keys",
    blurb: "Open-source model hub · Llama, Qwen, DeepSeek",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    hosted: false,
    env: "PERPLEXITY_API_KEY",
    helpUrl: "https://www.perplexity.ai/settings/api",
    blurb: "Sonar — search-grounded answers",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    hosted: false,
    env: "XAI_API_KEY",
    helpUrl: "https://console.x.ai/team/api-keys",
    blurb: "Grok family — code, reasoning",
  },
  {
    id: "groq",
    label: "Groq",
    hosted: false,
    env: "GROQ_API_KEY",
    helpUrl: "https://console.groq.com/keys",
    blurb: "LPU-accelerated · very low latency",
  },
  {
    id: "zai",
    label: "Z.AI / GLM",
    hosted: false,
    env: "ZAI_API_KEY",
    helpUrl: "https://docs.z.ai/devpack/tool/openai",
    blurb: "GLM-4.6 + 4.5 series · long context",
  },
];

export const DEFAULT_MODEL_PER_PROVIDER: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5",
  gemini: "gemini-2.5-pro",
  nvidia: "moonshotai/kimi-k2.5",
  openrouter: "tencent/hy3-preview:free",
  fireworks: "accounts/fireworks/models/deepseek-v3",
  dirgha: "deepseek",
  deepseek: "deepseek-chat",
  mistral: "mistral/mistral-large-latest",
  cohere: "cohere/command-a-03-2025",
  cerebras: "cerebras/llama-3.3-70b",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  perplexity: "perplexity/sonar",
  xai: "grok-4-fast",
  groq: "groq/llama-3.3-70b-versatile",
  zai: "zai/glm-4.6",
};

let escWasPressed = false;
function armEsc(): () => void {
  escWasPressed = false;
  const handler = (_str: string, key: { name?: string }) => {
    if (key.name === "escape") escWasPressed = true;
  };
  stdin.on("keypress", handler);
  return () => {
    stdin.off("keypress", handler);
  };
}

function dirghaHome(): string {
  return join(homedir(), ".dirgha");
}
function keysPath(): string {
  return join(dirghaHome(), "keys.json");
}
function configPath(): string {
  return join(dirghaHome(), "config.json");
}

async function readJson<T>(path: string): Promise<T | null> {
  const text = await readFile(path, "utf8").catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(
  path: string,
  data: unknown,
  mode?: number,
): Promise<void> {
  await mkdir(dirghaHome(), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  if (mode !== undefined) {
    try {
      await chmod(path, mode);
    } catch {
      /* non-POSIX */
    }
  }
}

async function persistDefaultModel(modelId: string): Promise<void> {
  const cfg = (await readJson<Record<string, unknown>>(configPath())) ?? {};
  cfg.model = modelId;
  await writeJson(configPath(), cfg);
}

async function persistApiKey(env: string, key: string): Promise<void> {
  const store = (await readJson<Record<string, string>>(keysPath())) ?? {};
  store[env] = key;
  await writeJson(keysPath(), store, 0o600);
}

async function promptHidden(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string> {
  // Override readline's echo while the user types so secrets don't render.
  const writer = rl as unknown as { _writeToOutput: (s: string) => void };
  const orig = writer._writeToOutput;
  writer._writeToOutput = (s: string): void => {
    if (s.startsWith(prompt)) stdout.write(prompt);
    // suppress everything else
  };
  try {
    const value = await rl.question(prompt);
    return value.trim();
  } finally {
    writer._writeToOutput = orig;
  }
}

function printHeader(): void {
  stdout.write(`\n${style(defaultTheme.accent, "◈ dirgha — setup")}\n`);
  stdout.write(
    `${style(defaultTheme.muted, "  Three-step provider · auth · model wizard.")}\n\n`,
  );
}

function printStep(n: 1 | 2 | 3, label: string): void {
  const hint = n > 1 ? "Esc to go back" : "Esc to cancel";
  stdout.write(
    `\n${style(defaultTheme.accent, `Step ${n} of 3`)} · ${label}  ${style(defaultTheme.muted, `(${hint})`)}\n\n`,
  );
}

async function pickProvider(
  rl: ReturnType<typeof createInterface>,
): Promise<ProviderChoice | null> {
  printStep(1, "Pick a provider");
  PROVIDERS.forEach((p, i) => {
    const num = `${i + 1}`.padStart(2);
    const tag = p.hosted ? style(defaultTheme.success, " [hosted]") : "";
    stdout.write(
      `  ${num}. ${style(defaultTheme.accent, p.label.padEnd(14))}${tag}  ${style(defaultTheme.muted, p.blurb)}\n`,
    );
  });
  const ans = (await rl.question(`\n  [1-${PROVIDERS.length}]: `)).trim();
  const idx = Number.parseInt(ans, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= PROVIDERS.length) {
    // Allow name match too.
    const byName = PROVIDERS.find(
      (p) =>
        p.id === ans.toLowerCase() ||
        p.label.toLowerCase() === ans.toLowerCase(),
    );
    return byName ?? null;
  }
  return PROVIDERS[idx] ?? null;
}

async function probeLocalServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

async function authenticateLocal(): Promise<boolean> {
  const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434/api/tags";
  const llamacppUrl =
    (process.env.LLAMACPP_URL ?? "http://localhost:8080/v1").replace(
      /\/+$/,
      "",
    ) + "/models";
  const [ollamaUp, llamacppUp] = await Promise.all([
    probeLocalServer(ollamaUrl),
    probeLocalServer(llamacppUrl),
  ]);
  if (ollamaUp)
    stdout.write(
      style(defaultTheme.success, `  ✓ Ollama responding at ${ollamaUrl}\n`),
    );
  else
    stdout.write(
      style(defaultTheme.muted, `  · Ollama not running at ${ollamaUrl}\n`),
    );
  if (llamacppUp)
    stdout.write(
      style(
        defaultTheme.success,
        `  ✓ llama.cpp responding at ${llamacppUrl}\n`,
      ),
    );
  else
    stdout.write(
      style(
        defaultTheme.muted,
        `  · llama.cpp not running at ${llamacppUrl}\n`,
      ),
    );
  if (!ollamaUp && !llamacppUp) {
    stdout.write(
      `\n  ${style(defaultTheme.warning, "Neither server is running.")} Install one:\n`,
    );
    stdout.write(
      `    Install Ollama:    ${style(defaultTheme.accent, "curl -fsSL https://ollama.com/install.sh | sh")}\n`,
    );
    stdout.write(
      `    Or llama.cpp:      ${style(defaultTheme.accent, "https://github.com/ggerganov/llama.cpp")}\n`,
    );
    stdout.write(
      `  ${style(defaultTheme.muted, "Continuing setup — you can start a server later.")}\n`,
    );
  }
  return true;
}

async function authenticate(
  provider: ProviderChoice,
  rl: ReturnType<typeof createInterface>,
): Promise<boolean> {
  printStep(2, `Authenticate · ${provider.label}`);
  if (provider.hosted) {
    return authenticateDirgha();
  }
  if (provider.id === "local") {
    return authenticateLocal();
  }
  if (!provider.env) return false;
  stdout.write(
    `  Get a key:  ${style(defaultTheme.accent, provider.helpUrl ?? "")}\n`,
  );
  stdout.write(
    `  Paste it below (input hidden — Esc→back, enter when done).\n\n`,
  );
  const key = await promptHidden(rl, `  ${provider.env}: `);
  stdout.write("\n");
  if (!key || key.length < 6) {
    stdout.write(
      style(
        defaultTheme.danger,
        "  ✗ Empty or implausibly short key — aborting.\n",
      ),
    );
    return false;
  }
  await persistApiKey(provider.env, key);
  stdout.write(
    style(
      defaultTheme.success,
      `  ✓ Saved ${provider.env} (${key.length} chars) at ~/.dirgha/keys.json (0600)\n`,
    ),
  );
  return true;
}

async function authenticateDirgha(): Promise<boolean> {
  let start;
  try {
    start = await startDeviceAuth();
  } catch (err) {
    stdout.write(
      style(
        defaultTheme.danger,
        `  ✗ Device-code start failed: ${err instanceof Error ? err.message : String(err)}\n`,
      ),
    );
    stdout.write(
      `  ${style(defaultTheme.muted, "Tip: pick a BYOK provider above to skip the hosted account.")}\n`,
    );
    return false;
  }
  stdout.write(`  1. Open: ${style(defaultTheme.accent, start.verifyUri)}\n`);
  stdout.write(
    `  2. Enter code: ${style(defaultTheme.accent, start.userCode)}\n\n`,
  );
  stdout.write(
    `  Waiting for authorization (expires in ~${Math.round(start.expiresIn / 60_000)} min)…\n`,
  );
  try {
    const result = await pollDeviceAuth(start.deviceCode, undefined, {
      intervalMs: start.interval,
      timeoutMs: start.expiresIn,
    });
    await saveToken(result.token, result.userId, result.email);
    stdout.write(
      style(defaultTheme.success, `\n  ✓ Signed in as ${result.email}\n`),
    );
    return true;
  } catch (err) {
    stdout.write(
      style(
        defaultTheme.danger,
        `\n  ✗ Login failed: ${err instanceof Error ? err.message : String(err)}\n`,
      ),
    );
    return false;
  }
}

function modelsForProvider(providerId: string): string[] {
  // For "dirgha" hosted, surface the same routable model set the
  // gateway exposes — same canonical aliases the runtime uses.
  if (providerId === "dirgha") {
    return [
      "deepseek",
      "kimi",
      "opus",
      "sonnet",
      "haiku",
      "gemini",
      "flash",
      "llama",
      "ling",
      "hy3",
    ];
  }
  return PRICES.filter((p) => p.provider === providerId).map((p) => p.model);
}

async function fetchLocalModels(): Promise<{
  models: string[];
  suggested: string;
}> {
  const out: string[] = [];
  let suggested = "";
  // Ollama: /api/tags returns { models: [{ name: 'llama3.2:3b', ... }] }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const json = (await res.json()) as { models?: Array<{ name?: string }> };
      for (const m of json.models ?? []) {
        if (m.name) out.push(`ollama/${m.name}`);
      }
      if (out.length > 0 && out[0]) suggested = out[0];
    }
  } catch {
    /* ignored */
  }
  // llama.cpp: /v1/models returns { data: [{ id: '...' }] }
  try {
    const base = (
      process.env.LLAMACPP_URL ?? "http://localhost:8080/v1"
    ).replace(/\/+$/, "");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${base}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const before = out.length;
      for (const m of json.data ?? []) {
        if (m.id) out.push(`llamacpp/${m.id}`);
      }
      if (!suggested && out.length > before && out[before])
        suggested = out[before]!;
    }
  } catch {
    /* ignored */
  }
  if (!suggested) suggested = "ollama/llama3.2:3b";
  return { models: out, suggested };
}

async function pickLocalModel(
  rl: ReturnType<typeof createInterface>,
): Promise<string | null> {
  printStep(3, "Pick a default model · Local");

  // Hardware probe → always show the user what they're working with.
  const { detectHardware, summariseHardware } =
    await import("../../setup/hardware-detect.js");
  const hw = await detectHardware();
  for (const line of summariseHardware(hw)) {
    stdout.write(`  ${style(defaultTheme.muted, line)}\n`);
  }
  stdout.write("\n");

  const { models, suggested } = await fetchLocalModels();
  if (models.length === 0) {
    // No server running — fall back to hardware-aware GGUF recommendations.
    const { recommendModels, modelDownloadHint } =
      await import("../../setup/model-curator.js");
    const recs = recommendModels(hw, 3);
    stdout.write(
      `  ${style(defaultTheme.warning, "No local server detected on :11434 (Ollama) or :8080 (llama.cpp).")}\n\n`,
    );
    if (recs.length > 0) {
      stdout.write(
        `  ${style(defaultTheme.accent, "Recommended for your hardware")} (Q4_K_M GGUF, ungated):\n`,
      );
      recs.forEach((m, i) => {
        stdout.write(
          `    ${i + 1}. ${style(defaultTheme.accent, m.name.padEnd(22))} ${m.sizeGB} GB · ${m.description}\n`,
        );
      });
      const top = recs[0];
      if (top) {
        stdout.write(
          `\n  ${style(defaultTheme.muted, "To install the top pick:")}\n`,
        );
        for (const line of modelDownloadHint(top).split("\n")) {
          stdout.write(`    ${style(defaultTheme.muted, line)}\n`);
        }
      }
    } else {
      stdout.write(
        `  ${style(defaultTheme.muted, "Hardware below the smallest tier (~2 GB RAM). Consider hosted providers.")}\n`,
      );
    }
    stdout.write(
      `\n  ${style(defaultTheme.muted, "Setup will store a placeholder default; re-run after the server is up.")}\n`,
    );
    const ans = (
      await rl.question(
        `\n  Press enter to accept ${style(defaultTheme.accent, suggested)}, or paste a model id: `,
      )
    ).trim();
    return ans.length > 0 ? ans : suggested;
  }
  const top = models.slice(0, 12);
  top.forEach((m, i) => {
    const num = `${i + 1}`.padStart(2);
    const marker =
      m === suggested ? style(defaultTheme.success, "  ← recommended") : "";
    stdout.write(`  ${num}. ${m}${marker}\n`);
  });
  const more = models.length - top.length;
  if (more > 0)
    stdout.write(
      `  ${style(defaultTheme.muted, `… ${more} more available`)}\n`,
    );
  const defaultIdx = `${Math.max(top.indexOf(suggested), 0) + 1}`;
  const ans = (
    await rl.question(`\n  [1-${top.length}, default ${defaultIdx}]: `)
  ).trim();
  const idx =
    ans === ""
      ? Number.parseInt(defaultIdx, 10) - 1
      : Number.parseInt(ans, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= top.length) {
    return ans.length > 0 ? ans : (top[0] ?? suggested);
  }
  return top[idx] ?? suggested;
}

async function pickModel(
  provider: ProviderChoice,
  rl: ReturnType<typeof createInterface>,
): Promise<string | null> {
  if (provider.id === "local") return pickLocalModel(rl);
  printStep(3, `Pick a default model · ${provider.label}`);
  const models = modelsForProvider(provider.id);
  if (models.length === 0) {
    stdout.write(
      `  ${style(defaultTheme.muted, "No catalogue entries for this provider yet — using `auto`.")}\n`,
    );
    return "auto";
  }
  const suggested = DEFAULT_MODEL_PER_PROVIDER[provider.id] ?? models[0];
  const top = models.slice(0, 8);
  // Make sure the suggested model is in the list shown.
  if (suggested !== undefined && !top.includes(suggested))
    top.unshift(suggested);
  top.forEach((m, i) => {
    const num = `${i + 1}`.padStart(2);
    const marker =
      m === suggested ? style(defaultTheme.success, "  ← recommended") : "";
    stdout.write(`  ${num}. ${m}${marker}\n`);
  });
  const more = models.length - top.length;
  if (more > 0) {
    stdout.write(
      `  ${style(defaultTheme.muted, `… ${more} more available via \`dirgha models list\` after setup`)}\n`,
    );
  }
  const defaultIdx =
    suggested !== undefined ? `${top.indexOf(suggested) + 1}` : "1";
  const ans = (
    await rl.question(`\n  [1-${top.length}, default ${defaultIdx}]: `)
  ).trim();
  const idx =
    ans === ""
      ? Number.parseInt(defaultIdx, 10) - 1
      : Number.parseInt(ans, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= top.length) {
    // Allow direct id paste.
    return ans.length > 0 ? ans : (suggested ?? top[0] ?? null);
  }
  return top[idx] ?? null;
}

function printCompletion(provider: ProviderChoice, model: string): void {
  stdout.write(`\n${style(defaultTheme.success, "✓ Setup complete.")}\n`);
  stdout.write(
    `  Provider:       ${style(defaultTheme.accent, provider.label)}\n`,
  );
  stdout.write(`  Default model:  ${style(defaultTheme.accent, model)}\n\n`);
  stdout.write(
    `  Next:  ${style(defaultTheme.accent, 'dirgha "your prompt"')}  (one-shot)\n`,
  );
  stdout.write(
    `         ${style(defaultTheme.accent, "dirgha")}                 (interactive REPL)\n`,
  );
  stdout.write(
    `         ${style(defaultTheme.accent, "dirgha keys add <provider>")}  (add another provider later)\n\n`,
  );
}

function printNonInteractiveHelp(): void {
  stdout.write(`\n${style(defaultTheme.accent, "◈ dirgha — setup")}\n\n`);
  stdout.write(`Non-interactive context detected. Configure manually:\n\n`);
  stdout.write(`  ${style(defaultTheme.accent, "Hosted account")}\n`);
  stdout.write(`    dirgha login\n\n`);
  stdout.write(
    `  ${style(defaultTheme.accent, "Local (llama.cpp / Ollama)")} — no key required:\n`,
  );
  stdout.write(
    `    Install Ollama:    curl -fsSL https://ollama.com/install.sh | sh\n`,
  );
  stdout.write(
    `    Or llama.cpp:      https://github.com/ggerganov/llama.cpp\n`,
  );
  stdout.write(`    Override URLs:     OLLAMA_URL=… LLAMACPP_URL=…\n\n`);
  stdout.write(`  ${style(defaultTheme.accent, "BYOK")} — pick one or more:\n`);
  for (const p of PROVIDERS.filter((x) => !x.hosted && x.env)) {
    stdout.write(
      `    export ${p.env}=<key>     ${style(defaultTheme.muted, p.helpUrl ?? "")}\n`,
    );
  }
  stdout.write(`\nThen pick a default model:\n`);
  stdout.write(`    dirgha models default <model-id>\n\n`);
}

export async function runWizard(argv: string[]): Promise<number> {
  const isTty = stdin.isTTY === true;
  const force =
    argv.includes("--interactive") || argv.includes("--interactive=true");
  const skip =
    argv.includes("--non-interactive") || argv.includes("--interactive=false");
  if (skip || (!isTty && !force)) {
    printNonInteractiveHelp();
    return 0;
  }

  printHeader();
  emitKeypressEvents(stdin);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    let step = 1;
    let provider: ProviderChoice | null = null;
    let model: string | null = null;

    while (true) {
      switch (step) {
        case 1: {
          const disarm = armEsc();
          provider = await pickProvider(rl);
          disarm();
          if (escWasPressed) {
            stdout.write(
              style(defaultTheme.muted, "\n  ← setup cancelled.\n\n"),
            );
            return 0;
          }
          if (!provider) {
            stdout.write(
              style(
                defaultTheme.danger,
                "  ✗ Invalid selection — try again.\n",
              ),
            );
            continue;
          }
          step = 2;
          break;
        }
        case 2: {
          const disarm = armEsc();
          const ok = await authenticate(provider!, rl);
          disarm();
          if (escWasPressed) {
            stdout.write(style(defaultTheme.muted, "  ← back\n"));
            step = 1;
            break;
          }
          if (!ok) return 1;
          step = 3;
          break;
        }
        case 3: {
          const disarm = armEsc();
          model = await pickModel(provider!, rl);
          disarm();
          if (escWasPressed) {
            stdout.write(style(defaultTheme.muted, "  ← back\n"));
            step = 2;
            break;
          }
          if (!model) return 1;
          await persistDefaultModel(model);
          await askTelemetryConsent(rl);
          printCompletion(provider!, model);
          return 0;
        }
      }
    }
  } finally {
    rl.close();
  }
}

async function askTelemetryConsent(
  rl:
    | { question: (q: string) => Promise<string> }
    | { question: (q: string, cb: (a: string) => void) => void },
): Promise<void> {
  // If the user has already explicitly enabled or disabled telemetry,
  // don't re-prompt. We track this via a `telemetry.consentSeen` flag.
  const { writeTelemetryConfig } = await import("../subcommands/telemetry.js");
  const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
  const homeMod = await import("node:os");
  const pathMod = await import("node:path");
  const cfgPath = pathMod.join(homeMod.homedir(), ".dirgha", "config.json");
  let cfg: any = {};
  try {
    if (existsSync(cfgPath)) cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    /* */
  }
  if (cfg?.telemetry?.consentSeen === true) return;

  stdout.write(
    `\n  ${style(defaultTheme.accent, "◈ Anonymous usage telemetry?")}\n`,
  );
  stdout.write(
    `  ${style(defaultTheme.muted, "Help us catch regressions — send 5 fields per command:")}\n`,
  );
  stdout.write(
    `  ${style(defaultTheme.muted, "    version, command, os bucket (linux/macos/win), node major, error class")}\n`,
  );
  stdout.write(
    `  ${style(defaultTheme.muted, "Never sent: prompts, responses, file contents, API key values.")}\n`,
  );
  stdout.write(
    `  ${style(defaultTheme.muted, "Read more: docs/privacy/CLI-TELEMETRY.md")}\n\n`,
  );

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => {
      // readline's question is async-cb in Node ≤ 20, async in Node 21+. Handle both.
      const r = rl as {
        question: (q: string, cb: (a: string) => void) => void;
      };
      r.question(q, (a) => resolve(a));
    });
  const answer = (
    await ask(
      `  ${style(defaultTheme.accent, "Enable telemetry? [y / N / r=read full policy]:")} `,
    )
  )
    .trim()
    .toLowerCase();

  if (answer === "r") {
    stdout.write(
      `\n  ${style(defaultTheme.muted, "See https://github.com/Dirgha-AI/dirgha-code/blob/main/docs/privacy/CLI-TELEMETRY.md")}\n`,
    );
    const followUp = (
      await ask(
        `  ${style(defaultTheme.accent, "Enable telemetry? [y / N]:")} `,
      )
    )
      .trim()
      .toLowerCase();
    if (followUp === "y") {
      writeTelemetryConfig({ enabled: true });
      stdout.write(
        `  ${style(defaultTheme.muted, "✓ telemetry enabled. Disable any time with `dirgha telemetry disable`.")}\n`,
      );
    } else {
      writeTelemetryConfig({ enabled: false });
      stdout.write(
        `  ${style(defaultTheme.muted, "✓ telemetry disabled. Nothing leaves your machine.")}\n`,
      );
    }
  } else if (answer === "y") {
    writeTelemetryConfig({ enabled: true });
    stdout.write(
      `  ${style(defaultTheme.muted, "✓ telemetry enabled. Disable any time with `dirgha telemetry disable`.")}\n`,
    );
  } else {
    writeTelemetryConfig({ enabled: false });
    stdout.write(
      `  ${style(defaultTheme.muted, "✓ telemetry disabled. Nothing leaves your machine.")}\n`,
    );
  }

  // Persist consentSeen so we never re-ask.
  try {
    if (existsSync(cfgPath)) cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.telemetry = { ...(cfg.telemetry ?? {}), consentSeen: true };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  } catch {
    /* */
  }
}

export const wizardSubcommand: Subcommand = {
  name: "setup",
  description: "Three-step provider · auth · model wizard",
  async run(argv) {
    return runWizard(argv);
  },
};
