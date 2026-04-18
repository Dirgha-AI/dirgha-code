/**
 * utils/profile.ts — Account profile store (~/.dirgha/profile.json)
 * Stores tier, plan, name fetched from api.dirgha.ai after login.
 * Separate from credentials.json (which holds the auth token).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROFILE_PATH = path.join(os.homedir(), '.dirgha', 'profile.json');
const GATEWAY_URL = (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/$/, '');

export interface UserProfile {
  userId: string;
  email: string;
  name?: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  plan?: string;
  creditsRemaining?: number;
  fetchedAt: string; // ISO
}

export function readProfile(): UserProfile | null {
  try {
    if (!fs.existsSync(PROFILE_PATH)) return null;
    const raw = fs.readFileSync(PROFILE_PATH, 'utf8');
    return JSON.parse(raw) as UserProfile;
  } catch { return null; }
}

export function writeProfile(profile: UserProfile): void {
  const dir = path.dirname(PROFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function clearProfile(): void {
  if (fs.existsSync(PROFILE_PATH)) fs.unlinkSync(PROFILE_PATH);
}

/** Fetch profile from api.dirgha.ai/api/auth/me and persist it */
export async function fetchAndStoreProfile(token: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      id?: string; userId?: string; email?: string; name?: string;
      tier?: string; plan?: string; ai_credits?: number; credits?: number;
    };
    const profile: UserProfile = {
      userId:          data.id ?? data.userId ?? '',
      email:           data.email ?? '',
      name:            data.name,
      tier:            (data.tier as UserProfile['tier']) ?? 'free',
      plan:            data.plan,
      creditsRemaining: data.ai_credits ?? data.credits,
      fetchedAt:       new Date().toISOString(),
    };
    writeProfile(profile);
    return profile;
  } catch { return null; }
}

/** Refresh profile if it's stale (>1 hour old) */
export async function refreshProfileIfStale(token: string): Promise<void> {
  const existing = readProfile();
  if (existing) {
    const age = Date.now() - new Date(existing.fetchedAt).getTime();
    if (age < 60 * 60 * 1000) return; // fresh enough
  }
  await fetchAndStoreProfile(token).catch(() => {});
}
