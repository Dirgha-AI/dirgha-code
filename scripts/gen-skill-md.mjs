#!/usr/bin/env node
/**
 * gen-skill-md.mjs — Auto-generate SKILL.md from commander command tree.
 *
 * Runs the CLI with a sentinel env var that makes it dump the command tree
 * to stdout as JSON instead of executing normally, then converts to
 * CLI-Anything-compliant SKILL.md format.
 *
 * Usage: node scripts/gen-skill-md.mjs [--out SKILL.md]
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, '..');
const CLI_BIN = join(CLI_ROOT, 'dist', 'dirgha.mjs');
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? join(CLI_ROOT, 'SKILL.md');

function dumpSpec() {
  // Run CLI with special dump flag. If the flag isn't supported yet, fall back to reading package.json
  try {
    const out = execFileSync('node', [CLI_BIN, '__dump_spec'], {
      encoding: 'utf8',
      env: { ...process.env, DIRGHA_DUMP_SPEC: '1' },
      timeout: 10000,
    });
    return JSON.parse(out);
  } catch (err) {
    console.error('Unable to dump spec automatically — ensure `node build.mjs` has run and `__dump_spec` command is wired in src/index.ts.');
    console.error(err.message);
    process.exit(1);
  }
}

function commandToYaml(cmd, indent = '  ') {
  const lines = [];
  lines.push(`${indent}- name: ${cmd.name}`);
  if (cmd.description) lines.push(`${indent}  description: ${JSON.stringify(cmd.description)}`);
  if (cmd.output) lines.push(`${indent}  output: ${cmd.output}`);
  if (cmd.args?.length) {
    lines.push(`${indent}  args:`);
    for (const a of cmd.args) {
      lines.push(`${indent}    - name: ${a.name}`);
      lines.push(`${indent}      type: ${a.type ?? 'string'}`);
      if (a.required) lines.push(`${indent}      required: true`);
    }
  }
  if (cmd.flags?.length) {
    lines.push(`${indent}  flags:`);
    for (const f of cmd.flags) {
      lines.push(`${indent}    - name: ${f.name}`);
      if (f.short) lines.push(`${indent}      short: ${f.short}`);
      lines.push(`${indent}      type: ${f.type ?? 'string'}`);
      if (f.description) lines.push(`${indent}      description: ${JSON.stringify(f.description)}`);
    }
  }
  if (cmd.subcommands?.length) {
    lines.push(`${indent}  subcommands:`);
    for (const sub of cmd.subcommands) {
      lines.push(...commandToYaml(sub, indent + '    '));
    }
  }
  return lines;
}

function specToSkillMd(spec) {
  const lines = [
    '---',
    `name: ${spec.name}`,
    `version: ${spec.version}`,
    `description: ${JSON.stringify(spec.description)}`,
    'commands:',
  ];
  for (const cmd of spec.commands) {
    lines.push(...commandToYaml(cmd));
  }
  lines.push('---');
  lines.push('');
  lines.push(`# ${spec.name}`);
  lines.push('');
  lines.push(spec.description);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  for (const cmd of spec.commands) {
    lines.push(`- \`${spec.name} ${cmd.name}\` — ${cmd.description ?? ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

const spec = dumpSpec();
const md = specToSkillMd(spec);
writeFileSync(OUT, md, 'utf8');
console.log(`✓ Wrote ${OUT} — ${spec.commands.length} commands documented`);
