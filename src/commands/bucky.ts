/**
 * Abundance CLI Commands — Dirgha Agentic Labor Marketplace
 * Maps `dirgha bucky *` to the Abundance API at api.dirgha.ai/api/bucky
 *
 * Commands:
 *   dirgha bucky status          — marketplace overview (my jobs, DIRGHA, agent)
 *   dirgha bucky jobs            — list available jobs
 *   dirgha bucky jobs post       — post a new job
 *   dirgha bucky guild list      — list guilds
 *   dirgha bucky guild create    — create a guild
 *   dirgha bucky guild join      — join a guild
 *   dirgha bucky agent start     — start IntakeAgent for your guild
 *   dirgha bucky agent stop      — stop IntakeAgent
 *   dirgha bucky agent status    — check running agent sessions
 *   dirgha bucky dirgha            — DIRGHA balance + stats
 *   dirgha bucky profile         — your reputation + attestations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readCredentials } from '../utils/credentials.js';

const GATEWAY = process.env.DIRGHA_GATEWAY_URL || 'https://api.dirgha.ai';
const BASE = `${GATEWAY}/api/bucky`;

function getAuth(): { token: string; userId: string } | null {
  const creds = readCredentials();
  if (!creds) return null;
  return { token: creds.token, userId: creds.userId };
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const auth = getAuth();
  if (!auth) {
    console.error(chalk.red('Not logged in. Run `dirgha login` first.'));
    process.exit(1);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

const err = (e: unknown) =>
  console.error(chalk.red('Error:'), e instanceof Error ? e.message : String(e));

export function registerBuckyCommands(program: Command): void {
  const bucky = program.command('bucky').description('Dirgha Abundance — agentic labor marketplace');

  // ── STATUS ─────────────────────────────────────────────────────────────────
  bucky
    .command('status')
    .description('Marketplace overview: your jobs, DIRGHA balance, agent status')
    .action(async () => {
      try {
        const auth = getAuth();
        if (!auth) { console.error(chalk.red('Not logged in.')); return; }

        const [profile, dirgha] = await Promise.allSettled([
          apiFetch(`/profiles/${auth.userId}`),
          apiFetch(`/dirgha/balance/${auth.userId}`),
        ]);

        console.log(chalk.bold.blue('\n  Dirgha Abundance\n'));

        if (profile.status === 'fulfilled') {
          const p = profile.value;
          console.log(`  ${chalk.dim('Role:')}       ${chalk.white(p.type || 'unknown')}`);
          console.log(`  ${chalk.dim('Reputation:')} ${chalk.yellow(p.reputation_score ?? 0)}/100`);
          console.log(`  ${chalk.dim('Guild:')}      ${chalk.white(p.guild_id ?? 'none')}`);
        }

        if (dirgha.status === 'fulfilled') {
          const d = dirgha.value;
          console.log(`  ${chalk.dim('DIRGHA:')}       ${chalk.green(d.balance ?? 0)} DIRGHA`);
        }

        console.log('');
      } catch (e) { err(e); }
    });

  // ── JOBS ───────────────────────────────────────────────────────────────────
  const jobs = bucky.command('jobs').description('Job marketplace commands');

  jobs
    .command('list')
    .description('List available jobs')
    .option('--status <s>', 'Filter by status (posted, bidding, in_progress)', 'posted')
    .option('--limit <n>', 'Max results', '20')
    .action(async (opts) => {
      try {
        const data = await apiFetch(`/jobs?status=${opts.status}&limit=${opts.limit}`);
        const list = data.jobs ?? data;
        if (!list.length) { console.log(chalk.dim('  No jobs found.')); return; }
        console.log('');
        for (const j of list) {
          console.log(`  ${chalk.bold(j.title)} ${chalk.dim(`#${j.id.slice(0, 8)}`)}`);
          console.log(`  ${chalk.dim('Budget:')} ${j.budget?.amount} ${j.budget?.currency}  ${chalk.dim('Status:')} ${j.status}`);
          console.log('');
        }
      } catch (e) { err(e); }
    });

  jobs
    .command('post')
    .description('Post a new job to the marketplace')
    .requiredOption('--title <t>', 'Job title')
    .requiredOption('--desc <d>', 'Job description')
    .option('--budget <n>', 'Budget amount', '5000')
    .option('--currency <c>', 'Currency (INR/USDT/SATS)', 'INR')
    .option('--skills <s>', 'Required skills (comma-separated)', '')
    .action(async (opts) => {
      try {
        const data = await apiFetch('/jobs', {
          method: 'POST',
          body: JSON.stringify({
            title: opts.title,
            description: opts.desc,
            budget: { amount: Number(opts.budget), currency: opts.currency },
            requirements: opts.skills ? opts.skills.split(',').map((s: string) => s.trim()) : [],
            milestones: [{ title: 'Delivery', deliverable: opts.title, pct_of_budget: 100 }],
          }),
        });
        console.log(chalk.green(`\n  ✓ Job posted: ${data.id}`));
        if (data.block_match) {
          console.log(chalk.cyan(`  CodeRails match: ${data.block_match.block_name} (${Math.round(data.block_match.confidence * 100)}% confidence)`));
        }
      } catch (e) { err(e); }
    });

  // ── GUILD ──────────────────────────────────────────────────────────────────
  const guild = bucky.command('guild').description('Guild management');

  guild
    .command('list')
    .description('List active guilds')
    .option('--limit <n>', 'Max results', '20')
    .action(async (opts) => {
      try {
        const data = await apiFetch(`/guilds?limit=${opts.limit}`);
        const list = data.guilds ?? data;
        if (!list.length) { console.log(chalk.dim('  No guilds found.')); return; }
        console.log('');
        for (const g of list) {
          console.log(`  ${chalk.bold(g.name)} ${chalk.dim(`#${g.id.slice(0, 8)}`)}`);
          console.log(`  ${chalk.dim('Members:')} ${g.member_count ?? 0}  ${chalk.dim('Specialties:')} ${(g.specialties ?? []).join(', ')}`);
          console.log('');
        }
      } catch (e) { err(e); }
    });

  guild
    .command('create')
    .description('Create a new guild')
    .requiredOption('--name <n>', 'Guild name')
    .option('--specialties <s>', 'Specialties (comma-separated)', 'fullstack')
    .option('--governance <g>', 'Governance rules (lead%,workers%,reserve%)', '30,60,10')
    .action(async (opts) => {
      try {
        const [lead, workers, reserve] = opts.governance.split(',').map(Number);
        const data = await apiFetch('/guilds', {
          method: 'POST',
          body: JSON.stringify({
            name: opts.name,
            specialties: opts.specialties.split(',').map((s: string) => s.trim()),
            governance_rules: { lead_pct: lead, workers_pct: workers, reserve_pct: reserve, quorum: 51 },
          }),
        });
        console.log(chalk.green(`\n  ✓ Guild created: ${data.id}`));
        console.log(chalk.dim(`  Share this ID for members to join: ${data.id}`));
      } catch (e) { err(e); }
    });

  guild
    .command('join <guildId>')
    .description('Join a guild by ID')
    .action(async (guildId) => {
      try {
        const auth = getAuth()!;
        await apiFetch(`/guilds/${guildId}/join`, {
          method: 'POST',
          body: JSON.stringify({ user_id: auth.userId }),
        });
        console.log(chalk.green(`\n  ✓ Joined guild ${guildId}`));
      } catch (e) { err(e); }
    });

  guild
    .command('treasury <guildId>')
    .description('View guild treasury balance')
    .action(async (guildId) => {
      try {
        const data = await apiFetch(`/guilds/${guildId}/treasury`);
        console.log(`\n  ${chalk.dim('Balance:')}    ${chalk.green(data.balance ?? 0)} sats`);
        console.log(`  ${chalk.dim('DIRGHA pool:')} ${chalk.yellow(data.dirgha_pool ?? 0)} DIRGHA`);
        console.log(`  ${chalk.dim('Members:')}   ${data.member_count ?? 0}`);
      } catch (e) { err(e); }
    });

  // ── AGENT ──────────────────────────────────────────────────────────────────
  const agent = bucky.command('agent').description('IntakeAgent management');

  agent
    .command('start <guildId>')
    .description('Start IntakeAgent for a guild (auto-bids on matching jobs)')
    .option('--threshold <n>', 'Minimum fit score to auto-bid (0-1)', '0.6')
    .action(async (guildId, opts) => {
      try {
        const data = await apiFetch(`/agents/intake/${guildId}/start`, {
          method: 'POST',
          body: JSON.stringify({ threshold: parseFloat(opts.threshold) }),
        });
        console.log(chalk.green(`\n  ✓ IntakeAgent started for guild ${guildId}`));
        console.log(chalk.dim(`  Agent will auto-bid on jobs with fit score ≥ ${opts.threshold}`));
        console.log(chalk.dim(`  Session: ${data.session_id ?? 'running'}`));
      } catch (e) { err(e); }
    });

  agent
    .command('stop <guildId>')
    .description('Stop IntakeAgent for a guild')
    .action(async (guildId) => {
      try {
        await apiFetch(`/agents/intake/${guildId}/stop`, { method: 'POST' });
        console.log(chalk.yellow(`\n  ⏹ IntakeAgent stopped for guild ${guildId}`));
      } catch (e) { err(e); }
    });

  agent
    .command('sessions')
    .description('List active agent sessions')
    .action(async () => {
      try {
        const data = await apiFetch('/agents/sessions');
        const list = data.sessions ?? data;
        if (!list.length) { console.log(chalk.dim('  No active sessions.')); return; }
        console.log('');
        for (const s of list) {
          console.log(`  ${chalk.bold(s.id.slice(0, 8))} — job: ${s.job_id?.slice(0, 8) ?? 'n/a'} — ${chalk.yellow(s.status)}`);
        }
      } catch (e) { err(e); }
    });

  // ── DIRGHA ───────────────────────────────────────────────────────────────────
  bucky
    .command('dirgha')
    .description('DIRGHA token balance and stats')
    .action(async () => {
      try {
        const auth = getAuth()!;
        const [balance, stats] = await Promise.allSettled([
          apiFetch(`/dirgha/balance/${auth.userId}`),
          apiFetch('/dirgha/stats'),
        ]);
        console.log(chalk.bold.blue('\n  $DIRGHA\n'));
        if (balance.status === 'fulfilled') {
          console.log(`  ${chalk.dim('Your balance:')} ${chalk.green(balance.value.balance ?? 0)} DIRGHA`);
        }
        if (stats.status === 'fulfilled') {
          const s = stats.value;
          console.log(`  ${chalk.dim('Total supply:')} ${s.total_supply ?? 0} / 1,000,000,000`);
          console.log(`  ${chalk.dim('Total burned:')} ${chalk.red(s.total_burned ?? 0)}`);
          console.log(`  ${chalk.dim('Wallets:')}      ${s.wallet_count ?? 0}`);
        }
        console.log('');
      } catch (e) { err(e); }
    });

  // ── PROFILE ────────────────────────────────────────────────────────────────
  bucky
    .command('profile')
    .description('Your reputation, attestations, and developer profile')
    .action(async () => {
      try {
        const auth = getAuth()!;
        const [profile, rep] = await Promise.allSettled([
          apiFetch(`/profiles/${auth.userId}`),
          apiFetch(`/reputation/${auth.userId}`),
        ]);
        console.log(chalk.bold.blue('\n  Your Abundance Profile\n'));
        if (profile.status === 'fulfilled') {
          const p = profile.value;
          console.log(`  ${chalk.dim('Type:')}       ${p.type}`);
          console.log(`  ${chalk.dim('GitHub:')}     ${p.github_username ?? 'not linked'}`);
          console.log(`  ${chalk.dim('Skills:')}     ${(p.skills ?? []).slice(0, 6).join(', ')}`);
          console.log(`  ${chalk.dim('Guild:')}      ${p.guild_id ?? 'none'}`);
        }
        if (rep.status === 'fulfilled') {
          const r = rep.value;
          console.log(`  ${chalk.dim('Reputation:')} ${chalk.yellow(r.score ?? 0)}/100`);
          console.log(`  ${chalk.dim('Jobs done:')}  ${r.jobs_completed ?? 0}`);
          console.log(`  ${chalk.dim('On-chain:')}   ${r.attestation_count ?? 0} EAS attestations`);
        }
        console.log('');
      } catch (e) { err(e); }
    });
}
