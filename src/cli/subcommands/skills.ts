/**
 * `dirgha skills <list|show|where>` — inspect loadable behaviour packs.
 *
 * Skills are markdown files with YAML frontmatter at:
 *   1. <cwd>/.dirgha/skills/<name>/SKILL.md  (project-local)
 *   2. ~/.dirgha/skills/<name>/SKILL.md       (user-global)
 *   3. node_modules/dirgha-skill-* package roots (npm-distributed, opt-in)
 *
 * Project skills override user skills with the same name.
 *
 * Frontmatter keys: name, description, version?, platforms?, triggers?, related?
 */

import { stdout, stderr } from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, stat, cp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, basename } from 'node:path';
import { loadSkills } from '../../skills/loader.js';
import { scanSkillBody, summariseScan } from '../../security/skill-scanner.js';
import { appendAudit } from '../../audit/writer.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const HELP = [
  'Usage:',
  '  dirgha skills                          List loaded skills',
  '  dirgha skills list                     Same as above',
  '  dirgha skills show <name>              Print one skill\'s body',
  '  dirgha skills where                    Show search roots',
  '  dirgha skills install <git-url|dir> [name] Clone a remote skill pack or copy a local dir (scanned before install)',
  '  dirgha skills uninstall <name>         Remove a user-global skill directory',
  '  dirgha skills audit [name]             Re-scan installed skills for prompt-injection / supply-chain risk',
].join('\n');

function userSkillsDir(): string {
  return join(homedir(), '.dirgha', 'skills');
}

function deriveName(url: string): string {
  // Use POSIX-or-backslash split so a Windows path like
  // C:\Users\me\skills\helper still derives "helper" not the whole drive.
  const last = url.split(/[\\/]/).filter(Boolean).pop() ?? 'skill';
  return last.replace(/\.git$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function dirExists(p: string): Promise<boolean> {
  return stat(p).then(s => s.isDirectory()).catch(() => false);
}

export const skillsSubcommand: Subcommand = {
  name: 'skills',
  description: 'List or inspect loadable skills',
  async run(argv): Promise<number> {
    const op = argv[0] ?? 'list';

    if (op === 'help' || op === '-h' || op === '--help') {
      stdout.write(HELP + '\n');
      return 0;
    }

    if (op === 'where') {
      stdout.write(style(defaultTheme.accent, '\nSkill search roots\n\n'));
      stdout.write(`  project   ${process.cwd()}/.dirgha/skills\n`);
      stdout.write(`  user      ~/.dirgha/skills\n`);
      stdout.write(`  package   node_modules/dirgha-skill-* (opt-in)\n`);
      return 0;
    }

    const skills = await loadSkills({ cwd: process.cwd() });

    if (op === 'list') {
      if (skills.length === 0) {
        stdout.write(style(defaultTheme.muted, '(no skills loaded — drop a SKILL.md into ~/.dirgha/skills/<name>/)\n'));
        return 0;
      }
      stdout.write(style(defaultTheme.accent, '\nDirgha skills\n\n'));
      const padN = Math.max(...skills.map(s => s.meta.name.length));
      for (const s of skills) {
        const triggers = s.meta.triggers
          ? `[${(s.meta.triggers.keywords ?? []).join(',') || (s.meta.triggers.filePatterns ?? []).join(',') || 'ambient'}]`
          : '[ambient]';
        stdout.write(`  ${s.meta.name.padEnd(padN)}  ${style(defaultTheme.muted, s.source.padEnd(8))}  ${style(defaultTheme.muted, triggers)}\n`);
        stdout.write(`  ${' '.repeat(padN)}  ${style(defaultTheme.muted, s.meta.description)}\n`);
      }
      stdout.write('\n');
      stdout.write(style(defaultTheme.muted, `  ${skills.length} skill${skills.length === 1 ? '' : 's'} loaded\n`));
      return 0;
    }

    if (op === 'show') {
      const name = argv[1];
      if (!name) { stderr.write(`Missing name.\n${HELP}\n`); return 2; }
      const hit = skills.find(s => s.meta.name === name);
      if (!hit) { stderr.write(`Skill "${name}" not found. List with: dirgha skills\n`); return 1; }
      stdout.write(`# ${hit.meta.name}\n`);
      stdout.write(`description: ${hit.meta.description}\n`);
      if (hit.meta.version) stdout.write(`version:     ${hit.meta.version}\n`);
      if (hit.meta.platforms) stdout.write(`platforms:   ${hit.meta.platforms.join(', ')}\n`);
      if (hit.meta.triggers) stdout.write(`triggers:    ${JSON.stringify(hit.meta.triggers)}\n`);
      stdout.write(`source:      ${hit.source}\n`);
      stdout.write(`path:        ${hit.path}\n\n`);
      stdout.write(hit.body);
      stdout.write('\n');
      return 0;
    }

    if (op === 'install') {
      const url = argv[1];
      if (!url) { stderr.write(`Missing git URL or directory path.\n${HELP}\n`); return 2; }
      // Defense in depth: even though we use the array form of execFile,
      // reject URLs that begin with `-` so a misconfigured caller (or
      // shell-substituted argument) can't smuggle a flag like
      // `--upload-pack=...` past the validator.
      if (url.startsWith('-')) { stderr.write(`Refusing URL that starts with "-": ${url}\n`); return 2; }
      const name = argv[2] ?? deriveName(url);
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) { stderr.write(`Invalid skill name "${name}". Use [a-zA-Z0-9_-]+.\n`); return 2; }
      const root = userSkillsDir();
      const target = join(root, name);
      await mkdir(root, { recursive: true });
      if (await dirExists(target)) { stderr.write(`Skill "${name}" already installed at ${target}. Uninstall first.\n`); return 1; }
      // If `url` is an absolute path to an existing directory, treat it as
      // a local skill pack and recursively copy it. This sidesteps the
      // cross-OS pain of `git clone file:///C:/...` on Windows and lets
      // the test harness exercise install/uninstall without a real git
      // remote. Anything else is treated as a git URL and cloned.
      const isLocalDir = isAbsolute(url) && await dirExists(url);
      try {
        if (isLocalDir) {
          await cp(url, target, { recursive: true, errorOnExist: true, force: false });
        } else {
          execFileSync('git', ['clone', '--depth=1', url, target], { stdio: ['ignore', 'pipe', 'pipe'] });
        }
      } catch (err) {
        stderr.write(`${isLocalDir ? 'local copy' : 'git clone'} failed: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
      const reloaded = await loadSkills({ cwd: process.cwd() });
      const found = reloaded.find(s => s.path.startsWith(target));
      if (!found) {
        stderr.write(`Installed from ${url} but no SKILL.md was found inside ${target}. The directory was kept.\n`);
        return 1;
      }
      // Layer-1 prompt-injection / supply-chain scan. Critical findings
      // block the install (we delete the freshly-cloned tree); medium
      // findings install but log a warning to audit.
      const scan = scanSkillBody(found.body, found.meta);
      void appendAudit({ kind: 'skill-scan', actor: name, summary: summariseScan(scan), verdict: scan.verdict, score: scan.score, findings: scan.findings, source: url });
      if (scan.verdict === 'block') {
        stderr.write(style(defaultTheme.danger, `✗ install blocked by skill-scanner: ${summariseScan(scan)}\n`));
        for (const f of scan.findings.slice(0, 5)) {
          stderr.write(`    ${f.severity.padEnd(8)} ${f.rule}${f.line ? ` (line ${f.line})` : ''}\n`);
          if (f.snippet) stderr.write(style(defaultTheme.muted, `    > ${f.snippet}\n`));
        }
        await rm(target, { recursive: true, force: true });
        stderr.write(style(defaultTheme.muted, `\nThe cloned tree was removed. Re-run with --force-unsafe-install to override (NOT recommended).\n`));
        return 1;
      }
      stdout.write(`${style(defaultTheme.success, '✓')} installed ${found.meta.name} (from ${url}) at ${target}\n`);
      stdout.write(style(defaultTheme.muted, `  description: ${found.meta.description}\n`));
      stdout.write(style(scan.verdict === 'warn' ? defaultTheme.danger : defaultTheme.muted, `  scan:        ${summariseScan(scan)}\n`));
      return 0;
    }

    if (op === 'audit') {
      const target = argv[1];
      const auditSkills = await loadSkills({ cwd: process.cwd() });
      const matches = target ? auditSkills.filter(s => s.meta.name === target) : auditSkills;
      if (matches.length === 0) {
        stderr.write(target ? `Skill "${target}" not found.\n` : '(no skills installed)\n');
        return target ? 1 : 0;
      }
      let blocked = 0, warned = 0, allowed = 0;
      for (const s of matches) {
        const scan = scanSkillBody(s.body, s.meta);
        const colour = scan.verdict === 'block' ? defaultTheme.danger : scan.verdict === 'warn' ? defaultTheme.accent : defaultTheme.success;
        stdout.write(`${style(colour, scan.verdict.padEnd(6))} ${s.meta.name.padEnd(24)} ${style(defaultTheme.muted, summariseScan(scan))}\n`);
        if (scan.verdict === 'block') blocked++;
        else if (scan.verdict === 'warn') warned++;
        else allowed++;
        for (const f of scan.findings.slice(0, 3)) {
          stdout.write(`         ${style(defaultTheme.muted, `${f.severity.padEnd(8)} ${f.rule}${f.line ? ` (line ${f.line})` : ''}`)}\n`);
        }
      }
      stdout.write(`\n${style(defaultTheme.accent, 'totals:')} ${allowed} allow · ${warned} warn · ${blocked} block\n`);
      return blocked > 0 ? 1 : 0;
    }

    if (op === 'uninstall') {
      const name = argv[1];
      if (!name) { stderr.write(`Missing skill name.\n${HELP}\n`); return 2; }
      const target = join(userSkillsDir(), basename(name));
      if (!await dirExists(target)) { stderr.write(`No skill at ${target}.\n`); return 1; }
      await rm(target, { recursive: true, force: true });
      stdout.write(`${style(defaultTheme.success, '✓')} uninstalled ${name} (${target})\n`);
      return 0;
    }

    stderr.write(`Unknown subcommand "${op}".\n${HELP}\n`);
    return 2;
  },
};
