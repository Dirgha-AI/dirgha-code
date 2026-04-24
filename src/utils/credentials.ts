import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Credentials {
  token: string;
  userId: string;
  email: string;
  expiresAt: string; // ISO timestamp
}

function credentialsPath(): string {
  return path.join(os.homedir(), '.dirgha', 'credentials.json');
}

function ensureDirghaDir(): void {
  const dir = path.join(os.homedir(), '.dirgha');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readCredentials(): Credentials | null {
  const p = credentialsPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const creds = JSON.parse(raw) as Credentials;
    // Check expiry
    if (new Date(creds.expiresAt) < new Date()) {
      return null; // expired
    }
    return creds;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials): void {
  ensureDirghaDir();
  const p = credentialsPath();
  fs.writeFileSync(p, JSON.stringify(creds, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function clearCredentials(): void {
  const p = credentialsPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function getToken(): string | null {
  return readCredentials()?.token ?? null;
}

export function isLoggedIn(): boolean {
  return readCredentials() !== null;
}

/**
 * Legacy alias for readCredentials used in embeddings/gateway.ts
 */
export function getCredentials(): Partial<Credentials> {
  return readCredentials() || {};
}

/**
 * Returns true if the CLI has a usable AI provider configured — either:
 * a) Dirgha account token (readCredentials), or
 * b) A BYOK API key in the environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
 *
 * Use this for the startup "ready" check instead of isLoggedIn().
 */
export function isConfigured(): boolean {
  if (readCredentials() !== null) return true;
  const BYOK_VARS = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
    'FIREWORKS_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY',
    'GEMINI_API_KEY', 'MISTRAL_API_KEY',
    'DIRGHA_GATEWAY_URL', 'DIRGHA_API_KEY',
  ];
  return BYOK_VARS.some(k => !!process.env[k]);
}
