/**
 * utils/keys.ts — BYOK (Bring Your Own Key) storage at ~/.dirgha/keys.json
 *
 * Public users:  dirgha login  → JWT → traffic via api.dirgha.ai (Dirgha revenue)
 * Power users:   dirgha keys set OPENROUTER_API_KEY sk-...  → direct routing
 *
 * Keys are stored in ~/.dirgha/keys.json (mode 0o600).
 * Never touches the project .env file.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const KEYS_PATH = path.join(os.homedir(), '.dirgha', 'keys.json');

type KeyStore = Record<string, string>;

export function readKeys(): KeyStore {
  try {
    if (!fs.existsSync(KEYS_PATH)) return {};
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) as KeyStore;
  } catch { return {}; }
}

export function setKey(name: string, value: string): void {
  fs.mkdirSync(path.dirname(KEYS_PATH), { recursive: true });
  const keys = readKeys();
  keys[name] = value;
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function deleteKey(name: string): void {
  const keys = readKeys();
  delete keys[name];
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function listKeys(): string[] {
  return Object.keys(readKeys());
}

/**
 * loadKeysIntoEnv — called once at startup.
 * Merges ~/.dirgha/keys.json into process.env WITHOUT overwriting
 * keys already set in the environment (shell env takes precedence).
 */
export function loadKeysIntoEnv(): void {
  const keys = readKeys();
  for (const [k, v] of Object.entries(keys)) {
    if (!process.env[k]) process.env[k] = v;
  }
}
