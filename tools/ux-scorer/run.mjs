#!/usr/bin/env node
/**
 * Multi-agent UX scorer for @dirgha/code.
 *
 * Spawns N "judge" LLMs against the installed `dirgha` binary, runs
 * each scripted journey via tmux, captures the transcript, then asks
 * each judge to score the run against the rubric. Aggregates median
 * across judges per dimension; emits a JSON report.
 *
 * CLI:
 *   node tools/ux-scorer/run.mjs                 # default fleet, default journeys
 *   node tools/ux-scorer/run.mjs --fleet=hy3     # single judge
 *   node tools/ux-scorer/run.mjs --journey=J1    # single journey
 *   node tools/ux-scorer/run.mjs --offline       # render journeys only, skip scoring
 *
 * The release gate (in publish.yml) runs this with the default fleet
 * and journeys, then fails the workflow if the overall median < 7.0.
 *
 * Environment:
 *   OPENROUTER_API_KEY    — required for hy3 judge
 *   NVIDIA_API_KEY        — required for deepseek-v4-pro judge
 *   GROQ_API_KEY          — required for kimi-k2 judge
 * Missing keys auto-skip that judge; if the entire fleet has no keys
 * the run prints a clear "no judges configured" message and exits 0
 * (so a fork without secrets can still tag without ux-scorer blocking).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => {
  const a = args.find(x => x.startsWith(`--${k}=`));
  return a ? a.split('=', 2)[1] : (args.includes(`--${k}`) ? true : null);
};

const fleetArg = flag('fleet');
const journeyArg = flag('journey');
const offline = flag('offline') === true;
const gateThreshold = Number(flag('threshold') || '7.0');

const RUN_ID = process.env.UX_RUN_ID || `${Date.now()}`;
const OUT_DIR = join(tmpdir(), `dirgha-ux-${RUN_ID}`);
mkdirSync(OUT_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────────────────────
// Fleet definition. Each judge is { id, label, key, model, baseUrl }.
// `key` names the env var holding the credential.
// ────────────────────────────────────────────────────────────────────────────
const FLEET = [
  // Inclusion AI Ling — free + reliable JSON output. Primary default.
  { id: 'ling',           label: 'Ling 2.6',        key: 'OPENROUTER_API_KEY', model: 'inclusionai/ling-2.6-1t:free',    baseUrl: 'https://openrouter.ai/api/v1' },
  // Hy3 — free but emits long reasoning prefixes that sometimes trail prose.
  { id: 'hy3',            label: 'Hy3 Preview',     key: 'OPENROUTER_API_KEY', model: 'tencent/hy3-preview:free',       baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'deepseek-v4',    label: 'DeepSeek V4 Pro', key: 'NVIDIA_API_KEY',     model: 'deepseek-ai/deepseek-v4-pro',     baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'kimi-k2',        label: 'Kimi K2',         key: 'GROQ_API_KEY',       model: 'moonshotai/kimi-k2-instruct',     baseUrl: 'https://api.groq.com/openai/v1' },
];

const fleet = fleetArg
  ? FLEET.filter(j => j.id === fleetArg)
  : FLEET.filter(j => Boolean(process.env[j.key]));

// ────────────────────────────────────────────────────────────────────────────
// Journeys — each is a sequence of tmux send-keys steps, captured into a
// transcript file. The judge model receives the transcript + rubric and
// emits a JSON scorecard.
// ────────────────────────────────────────────────────────────────────────────
const JOURNEYS = [
  {
    id: 'J1', name: 'Cold-start sign-in',
    steps: [
      { type: 'wait', ms: 3000 },
      { type: 'text', s: '/login' },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 4000 },
      { type: 'key',  s: 'Escape' },
      { type: 'wait', ms: 500 },
    ],
    dims: ['discoverability', 'narration_quality'],
  },
  {
    id: 'J2', name: 'First chat with tool call',
    requiresKey: 'OPENROUTER_API_KEY',
    steps: [
      { type: 'wait', ms: 3000 },
      { type: 'text', s: 'Use the shell tool to list files in /tmp and count them. Reply with just the count.' },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 25000 },
    ],
    dims: ['narration_quality', 'tool_call_correctness'],
  },
  {
    id: 'J3', name: 'Switch model',
    steps: [
      { type: 'wait', ms: 3000 },
      { type: 'text', s: '/models' },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 1500 },
      { type: 'key',  s: 'Down' },
      { type: 'wait', ms: 300 },
      { type: 'key',  s: 'Down' },
      { type: 'wait', ms: 300 },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 1500 },
    ],
    dims: ['discoverability', 'visible_state_freshness'],
  },
  {
    id: 'J4', name: 'Theme switch',
    steps: [
      { type: 'wait', ms: 3000 },
      { type: 'text', s: '/theme' },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 1500 },
      { type: 'key',  s: 'Down' },
      { type: 'wait', ms: 300 },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 1500 },
    ],
    dims: ['visible_state_freshness'],
  },
  {
    id: 'J5', name: 'Update self-check',
    steps: [
      { type: 'wait', ms: 3000 },
      { type: 'text', s: '/update' },
      { type: 'key',  s: 'Enter' },
      { type: 'wait', ms: 5000 },
    ],
    dims: ['discoverability', 'narration_quality'],
  },
];

const journeys = journeyArg
  ? JOURNEYS.filter(j => j.id === journeyArg)
  : JOURNEYS;

// ────────────────────────────────────────────────────────────────────────────
// Step 1 — record the journey transcript via tmux.
// ────────────────────────────────────────────────────────────────────────────
async function recordJourney(j) {
  const sess = `ux-${j.id.toLowerCase()}-${Date.now()}`;
  const transcript = join(OUT_DIR, `${j.id}.transcript.txt`);
  spawnSync('tmux', ['kill-session', '-t', sess], { stdio: 'ignore' });
  // Pin TERM so tmux can start a server in CI.
  const env = { ...process.env, TERM: 'xterm-256color' };
  // Seed ~/.dirgha to skip the wizard.
  if (!existsSync(`${process.env.HOME}/.dirgha/keys.json`)) {
    spawnSync('bash', [join(HERE, '..', 'vhs', 'seed-home.sh')], { env, stdio: 'inherit' });
  }
  spawnSync('tmux', ['new-session', '-d', '-s', sess, '-x', '120', '-y', '32', 'dirgha'], { env });
  for (const step of j.steps) {
    if (step.type === 'wait') {
      await new Promise(r => setTimeout(r, step.ms));
    } else if (step.type === 'text') {
      spawnSync('tmux', ['send-keys', '-t', sess, '-l', step.s], { env });
    } else if (step.type === 'key') {
      spawnSync('tmux', ['send-keys', '-t', sess, step.s], { env });
    }
  }
  const cap = spawnSync('tmux', ['capture-pane', '-t', sess, '-p', '-S', '-200'], { env, encoding: 'utf8' });
  const body = cap.stdout || '';
  writeFileSync(transcript, body);
  spawnSync('tmux', ['kill-session', '-t', sess], { stdio: 'ignore' });
  return { id: j.id, name: j.name, transcript, body, dims: j.dims };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — ask each judge to score the captured transcript.
// ────────────────────────────────────────────────────────────────────────────
const RUBRIC = readFileSync(join(HERE, 'rubric.md'), 'utf8');
const JUDGE_PROMPT = (transcript, dims) => `You are a UX judge for the Dirgha CLI.

You will see a tmux pane capture of one user journey. Score the run on the following dimensions only — leave others as null.

Dimensions to score: ${dims.join(', ')}

Rubric (each 0–10):
- discoverability: Could a new user find the feature without external docs?
- narration_quality: When the CLI is doing something, do you understand what?
- tool_call_correctness: When the agent invokes a tool, does it do the right thing with the right args? (null if no tool call in this journey)
- visible_state_freshness: Does the UI reflect reality? (token count, mode, model)
- error_recovery: When something goes wrong, can the user fix it without restarting? (null if no error)

Tmux pane capture:
\`\`\`
${transcript.slice(0, 4000)}
\`\`\`

Reply with a single JSON object. Example:
{"discoverability": 8, "narration_quality": 7, "tool_call_correctness": null, "visible_state_freshness": 9, "error_recovery": null, "notes": "Picker opened cleanly; status bar reflected new model."}

JSON only, no prose.`;

async function judge(judge, journey, debugTag = 'unknown') {
  const url = `${judge.baseUrl}/chat/completions`;
  const body = {
    model: judge.model,
    messages: [{ role: 'user', content: JUDGE_PROMPT(journey.body, journey.dims) }],
    temperature: 0.2,
    max_tokens: 400,
  };
  const apiKey = process.env[judge.key];
  if (!apiKey) return { error: `${judge.key} not set` };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { error: `HTTP ${r.status}: ${await r.text().catch(() => '')}`.slice(0, 300) };
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    // Strip code fences + grab the largest balanced { ... } object.
    const cleaned = text.replace(/```(?:json)?/g, '').trim();
    // Match the LAST { ... } (greedy) since judges sometimes prefix with prose.
    const matches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
    const candidate = matches.length > 0 ? matches[matches.length - 1][0] : null;
    // Fallback: try the entire { ... } envelope (greedy) for nested objects.
    const greedy = cleaned.match(/\{[\s\S]*\}/);
    const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
    const parsed = (candidate && tryParse(candidate)) ?? (greedy && tryParse(greedy[0]));
    if (!parsed) {
      // Log raw response so we can iterate on the judge prompt.
      writeFileSync(join(OUT_DIR, `judge-raw-${debugTag}-${judge.id}.txt`), text);
      return { error: 'no parseable JSON in response', raw: text.slice(0, 300) };
    }
    return { score: parsed };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — aggregate (median per dimension across journeys × judges).
// ────────────────────────────────────────────────────────────────────────────
function median(xs) {
  const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ────────────────────────────────────────────────────────────────────────────
// Main.
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`UX scorer · run ${RUN_ID}`);
  console.log(`Fleet: ${fleet.length === 0 ? 'NONE — all judge keys missing' : fleet.map(j => j.id).join(', ')}`);
  console.log(`Journeys: ${journeys.map(j => j.id).join(', ')}`);
  console.log(`Output: ${OUT_DIR}`);

  if (fleet.length === 0) {
    console.log('\nNo judge keys present. Recording journeys but skipping scoring.');
  }

  const recorded = [];
  for (const j of journeys) {
    process.stdout.write(`\n→ recording ${j.id} ${j.name} ... `);
    const r = await recordJourney(j);
    recorded.push(r);
    console.log(`captured ${r.body.length} chars → ${r.transcript}`);
  }

  if (offline || fleet.length === 0) {
    writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ run_id: RUN_ID, fleet: [], journeys: recorded.map(r => ({ id: r.id, name: r.name })), passes_gate: true, mode: 'offline' }, null, 2));
    console.log(`\nOffline mode — recordings saved to ${OUT_DIR}. Skipping scoring.`);
    return;
  }

  const results = [];
  for (const r of recorded) {
    for (const j of fleet) {
      process.stdout.write(`  · ${r.id} × ${j.id} ... `);
      const s = await judge(j, r, r.id);
      if (s.error) {
        console.log(`ERROR: ${s.error}`);
        results.push({ journey: r.id, agent: j.id, error: s.error });
      } else {
        const overall = ['discoverability', 'narration_quality', 'tool_call_correctness', 'visible_state_freshness', 'error_recovery']
          .map(d => s.score[d]).filter(x => typeof x === 'number');
        const avg = overall.length ? Math.round(overall.reduce((a, b) => a + b, 0) / overall.length * 10) / 10 : null;
        console.log(`scored avg=${avg}`);
        results.push({ journey: r.id, agent: j.id, scores: s.score });
      }
    }
  }

  // Median per dimension across all (journey × agent) cells.
  const dims = ['discoverability', 'narration_quality', 'tool_call_correctness', 'visible_state_freshness', 'error_recovery'];
  const medians = Object.fromEntries(dims.map(d => [d, median(results.flatMap(r => r.scores ? [r.scores[d]] : []))]));
  const overallMedian = median(Object.values(medians).filter(x => typeof x === 'number'));
  const passes = overallMedian === null ? true : overallMedian >= gateThreshold;

  const report = {
    run_id: RUN_ID,
    fleet: fleet.map(j => j.id),
    journeys: journeys.map(j => j.id),
    threshold: gateThreshold,
    results,
    median_per_dimension: medians,
    overall_median: overallMedian,
    passes_gate: passes,
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n────────────────────────────────────');
  console.log(`overall median: ${overallMedian} / threshold: ${gateThreshold}`);
  console.log(`gate: ${passes ? 'PASS' : 'FAIL'}`);
  console.log(`report: ${join(OUT_DIR, 'report.json')}`);
  console.log('────────────────────────────────────');

  process.exit(passes ? 0 : 1);
}

main().catch(err => {
  console.error('ux-scorer failed:', err);
  process.exit(2);
});
