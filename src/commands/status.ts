/**
 * commands/status.ts — `dirgha status`
 * Shows account info, tier, credits, quota, session state, and project config.
 */
import chalk from 'chalk';
import { readCredentials, isLoggedIn } from '../utils/credentials.js';
import { readProfile, fetchAndStoreProfile } from '../utils/profile.js';
import { getToken } from '../utils/credentials.js';
import { checkQuota } from '../billing/quota.js';
import { checkRateLimit } from '../billing/ratelimit.js';
import { readState } from '../utils/state.js';
import { listDBSessions } from '../session/persistence.js';
import { isProjectInitialized, readProjectConfig } from '../utils/config.js';

function bar(pct: number, width = 20): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  const color = pct > 90 ? chalk.red : pct > 70 ? chalk.yellow : chalk.green;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}

export async function accountStatusCommand(): Promise<void> {
  console.log();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const loggedIn = isLoggedIn();
  if (!loggedIn) {
    console.log(chalk.yellow('  Not logged in — run: dirgha login'));
    console.log();
    return;
  }

  const creds = readCredentials()!;
  let profile = readProfile();

  // Try to refresh profile if stale or missing
  if (!profile) {
    const token = getToken();
    if (token) profile = await fetchAndStoreProfile(token);
  }

  console.log(chalk.bold('  Account'));
  console.log(`  ${'Email'.padEnd(12)} ${chalk.cyan(creds.email)}`);
  if (profile) {
    console.log(`  ${'Plan'.padEnd(12)} ${chalk.cyan(profile.tier ?? 'free')}`);
    if (profile.creditsRemaining !== undefined) {
      const credits = profile.creditsRemaining.toLocaleString();
      console.log(`  ${'Credits'.padEnd(12)} ${chalk.green(credits)}`);
    }
    if (profile.name) {
      console.log(`  ${'Name'.padEnd(12)} ${chalk.dim(profile.name)}`);
    }
  }
  console.log(`  ${'Expires'.padEnd(12)} ${chalk.dim(new Date(creds.expiresAt).toLocaleDateString())}`);
  console.log();

  // ── Quota ───────────────────────────────────────────────────────────────────
  const tier = profile?.tier ?? 'free';
  const quota = checkQuota(tier);
  const rate = checkRateLimit(creds.userId, tier);

  const dailyPct = quota.dailyLimit > 0 ? Math.round((quota.dailyTokens / quota.dailyLimit) * 100) : 0;
  const monthlyPct = quota.monthlyLimit > 0 ? Math.round((quota.monthlyTokens / quota.monthlyLimit) * 100) : 0;

  console.log(chalk.bold('  Quota'));
  console.log(`  ${'Daily'.padEnd(12)} ${bar(dailyPct)} ${dailyPct}%`);
  console.log(`  ${''.padEnd(12)} ${quota.dailyTokens.toLocaleString()} / ${quota.dailyLimit.toLocaleString()} tokens`);
  console.log(`  ${'Monthly'.padEnd(12)} ${bar(monthlyPct)} ${monthlyPct}%`);
  console.log(`  ${''.padEnd(12)} ${quota.monthlyTokens.toLocaleString()} / ${quota.monthlyLimit.toLocaleString()} tokens`);
  console.log(`  ${'Rate limit'.padEnd(12)} ${rate.remainingRequests} requests remaining`);
  if (quota.exceeded) console.log(`  ${chalk.red('⚠  Quota exceeded — upgrade at dirgha.ai/pricing')}`);
  console.log();

  // ── Session ─────────────────────────────────────────────────────────────────
  const state = readState();
  const sessions = listDBSessions();
  console.log(chalk.bold('  Sessions'));
  console.log(`  ${'Saved'.padEnd(12)} ${sessions.length}`);
  if (state.lastSessionId) {
    const last = sessions.find(s => s.id === state.lastSessionId);
    if (last) {
      console.log(`  ${'Last'.padEnd(12)} ${chalk.dim(last.id.slice(0, 8))} · ${chalk.dim(last.title.slice(0, 40))}`);
    }
  }
  if (state.lastModel) {
    console.log(`  ${'Model'.padEnd(12)} ${chalk.cyan(state.lastModel)}`);
  }
  console.log();

  // ── Project ─────────────────────────────────────────────────────────────────
  if (isProjectInitialized()) {
    const config = readProjectConfig();
    if (config) {
      console.log(chalk.bold('  Project'));
      console.log(`  ${'Name'.padEnd(12)} ${chalk.cyan(config.project.name)}`);
      console.log(`  ${'Type'.padEnd(12)} ${chalk.dim(config.project.type)}`);
      console.log(`  ${'Files'.padEnd(12)} ${config.context.structure.fileCount}`);
      console.log(`  ${'Provider'.padEnd(12)} ${chalk.dim(config.preferences.defaultProvider)}`);
      console.log();
    }
  } else {
    console.log(chalk.dim('  No project — run: dirgha init'));
    console.log();
  }
}
