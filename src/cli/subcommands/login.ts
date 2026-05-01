/**
 * `dirgha login` — interactive sign-in.
 *
 * Two flows:
 *   - Default: device-code sign-in to the dirgha gateway.
 *   - `--provider=<name>`: BYOK flow that stores a per-provider API
 *     key in `~/.dirgha/keys.json` (mode 0600) so dirgha doesn't need
 *     a gateway account at all. The key is read first from
 *     `--key=<value>`, otherwise from a hidden stdin prompt.
 *
 * Non-REPL variant of the `/login` slash command. Returns POSIX exit codes.
 */

import { stdin, stdout } from "node:process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  pollDeviceAuth,
  saveToken,
  startDeviceAuth,
} from "../../integrations/device-auth.js";
import { defaultTheme, style } from "../../tui/theme.js";
import type { Subcommand } from "./index.js";

const PROVIDER_ENV: Record<string, string> = {
  nvidia: "NVIDIA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
};

function print(line: string): void {
  stdout.write(`${line}\n`);
}

function parseFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === `--${name}` && i + 1 < argv.length) return argv[i + 1];
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return undefined;
}

function keyStorePath(): string {
  return join(homedir(), ".dirgha", "keys.json");
}

async function readKeys(): Promise<Record<string, string>> {
  const text = await readFile(keyStorePath(), "utf8").catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeKeys(store: Record<string, string>): Promise<void> {
  await mkdir(join(homedir(), ".dirgha"), { recursive: true });
  await writeFile(
    keyStorePath(),
    JSON.stringify(store, null, 2) + "\n",
    "utf8",
  );
  try {
    await chmod(keyStorePath(), 0o600);
  } catch {
    /* non-POSIX */
  }
}

async function promptHidden(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  // Simple hidden read: replace the readline echo with nothing.
  // Works for typed input; pasted input is fine too.
  const orig = (rl as unknown as { _writeToOutput: (s: string) => void })
    ._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
    s: string,
  ) => {
    if (s.startsWith(prompt)) stdout.write(prompt);
    // suppress everything else
  };
  try {
    const value = await rl.question(prompt);
    return value.trim();
  } finally {
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      orig;
    rl.close();
    if (wasRaw && stdin.setRawMode) stdin.setRawMode(true);
  }
}

async function runProviderLogin(
  provider: string,
  argv: string[],
): Promise<number> {
  const env = PROVIDER_ENV[provider.toLowerCase()];
  if (!env) {
    print(
      style(
        defaultTheme.danger,
        `\n✗ Unknown provider "${provider}". Known: ${Object.keys(PROVIDER_ENV).join(", ")}`,
      ),
    );
    return 1;
  }
  let key = parseFlag(argv, "key");
  if (!key) {
    print(style(defaultTheme.accent, `\nBYOK login for ${provider}`));
    print(
      style(defaultTheme.muted, `  paste your ${env} value (input hidden):`),
    );
    key = await promptHidden("> ");
  }
  if (!key || key.length < 6) {
    print(
      style(
        defaultTheme.danger,
        "\n✗ Empty or implausibly short key — aborted.",
      ),
    );
    return 1;
  }
  const store = await readKeys();
  store[env] = key;
  await writeKeys(store);
  print(
    style(
      defaultTheme.success,
      `\n✓ Stored ${env} (${key.length} chars) at ~/.dirgha/keys.json (mode 0600).`,
    ),
  );
  print(
    style(
      defaultTheme.muted,
      "  Run `dirgha keys list` to verify, or `dirgha logout --provider=" +
        provider +
        "` to remove.",
    ),
  );
  return 0;
}

export async function runLogin(argv: string[]): Promise<number> {
  const provider = parseFlag(argv, "provider");
  if (provider) return runProviderLogin(provider, argv);

  const apiBase = parseFlag(argv, "api-base") ?? process.env.DIRGHA_API_BASE;

  print(style(defaultTheme.accent, "\ndirgha — device-code sign-in"));
  let start;
  try {
    start = await startDeviceAuth(apiBase);
  } catch (err) {
    print(
      style(
        defaultTheme.danger,
        `\n✗ device/request failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return 2;
  }

  print("");
  print(`  1. Open: ${start.verifyUri}`);
  print(`  2. Enter code: ${style(defaultTheme.accent, start.userCode)}`);
  print("");
  print(
    `Waiting for authorization (expires in ~${Math.round(start.expiresIn / 60_000)} min)...`,
  );

  try {
    const result = await pollDeviceAuth(start.deviceCode, apiBase, {
      intervalMs: start.interval,
      timeoutMs: start.expiresIn,
    });
    await saveToken(result.token, result.userId, result.email);
    print(style(defaultTheme.success, `\n✓ Signed in as ${result.email}`));
    return 0;
  } catch (err) {
    print(
      style(
        defaultTheme.danger,
        `\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return 1;
  }
}

export const loginSubcommand: Subcommand = {
  name: "login",
  description: "Sign in via device-code flow",
  async run(argv) {
    return runLogin(argv);
  },
};
