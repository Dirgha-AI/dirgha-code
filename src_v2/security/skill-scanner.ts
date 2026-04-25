/**
 * Skill prompt-injection / supply-chain scanner.
 *
 * Layer-1 of dirgha's skill defence: a heuristic scanner that runs
 * on every install AND every load. Catches the obvious red flags
 * before a third-party SKILL.md body is allowed into the system
 * prompt. No external deps; ships with the CLI.
 *
 * Layer-2 is the optional `@dirgha/arniko-plugin` extension that
 * augments this with Arniko's 36-scanner pipeline. When the plugin
 * is installed it runs after this scanner; when it isn't, the
 * heuristic alone is the defence.
 *
 * Initial implementation seeded by a hy3 dogfood run.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Verdict = 'allow' | 'warn' | 'block';

export interface Finding {
  severity: Severity;
  rule: string;
  snippet?: string;
  line?: number;
}

export interface ScanResult {
  verdict: Verdict;
  score: number;
  findings: Finding[];
}

export interface SkillMetaLike {
  name?: string;
  description?: string;
  triggers?: { keywords?: string[]; filePatterns?: string[] };
}

const DELTAS: Record<string, number> = {
  impersonation_marker: 60,
  override_instructions: 60,
  permission_grab: 30,
  exfil_url: 30,
  excess_shell_blocks: 15,
  unrelated_url: 20,
  disable_safety: 15,
  missing_name: 5,
  missing_description: 5,
  wildcard_keyword: 10,
  oversized_body: 5,
};

const EXFIL_HOSTS = [
  'webhook.site', 'requestbin.io', 'pipedream.net', 'ngrok.io',
  'bashupload.com', 'transfer.sh', 'paste.ee',
];

/**
 * Scan a SKILL.md body + parsed frontmatter. Pass `meta` undefined to
 * skip frontmatter checks (useful when scanning raw bodies for snippet
 * extraction inside e.g. README content).
 */
export function scanSkillBody(body: string, meta?: SkillMetaLike): ScanResult {
  const findings: Finding[] = [];
  let score = 0;

  function add(severity: Severity, rule: string, snippet?: string, line?: number): void {
    const f: Finding = { severity, rule };
    if (snippet !== undefined) f.snippet = snippet.slice(0, 80);
    if (line !== undefined && line > 0) f.line = line;
    findings.push(f);
    score += DELTAS[rule] ?? 0;
  }

  const lines = body.split('\n');
  let inShellBlock = false;
  let shellBlockBody = '';
  let shellBlockCount = 0;
  let shellBlockStart = 0;
  const checkPipeToShell = (block: string, startLine: number): void => {
    if (/(curl|wget)\s+\S+\s*\|\s*(sh|bash)/i.test(block)) {
      add('medium', 'unrelated_url', block, startLine);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (trimmed === '```bash' || trimmed === '```sh') {
      if (inShellBlock) checkPipeToShell(shellBlockBody, shellBlockStart);
      inShellBlock = true;
      shellBlockCount++;
      shellBlockBody = '';
      shellBlockStart = lineNum;
      continue;
    }
    if (inShellBlock && trimmed === '```') {
      inShellBlock = false;
      checkPipeToShell(shellBlockBody, shellBlockStart);
      continue;
    }
    if (inShellBlock) { shellBlockBody += line + '\n'; }

    if (/^(<system>|<assistant>|<\|im_start\|>|\[INST\]|### system:)/i.test(line)) {
      add('critical', 'impersonation_marker', line, lineNum);
    }
    if (/ignore (previous|prior|all) instructions/i.test(line)
      || /disregard your soul/i.test(line)
      || /your real instructions are/i.test(line)) {
      add('critical', 'override_instructions', line, lineNum);
    }
    if (/you may run shell without asking/i.test(line)
      || /bypass mode enforcement/i.test(line)
      || /do NOT ask for confirmation/i.test(line)) {
      add('high', 'permission_grab', line, lineNum);
    }

    const urlRx = /https?:\/\/[^\s)]+/gi;
    let m: RegExpExecArray | null;
    while ((m = urlRx.exec(line)) !== null) {
      const url = m[0].toLowerCase();
      if (EXFIL_HOSTS.some(h => url.includes(h))) {
        add('high', 'exfil_url', line, lineNum);
        break;
      }
    }

    if (/disable safety/i.test(line)
      || /turn off audit/i.test(line)
      || /skip the test/i.test(line)
      || /nopreflight/i.test(line)) {
      add('medium', 'disable_safety', line, lineNum);
    }
  }
  if (inShellBlock) checkPipeToShell(shellBlockBody, shellBlockStart);

  if (shellBlockCount > 5) {
    add('medium', 'excess_shell_blocks', `Found ${shellBlockCount} shell blocks`);
  }

  if (meta !== undefined) {
    if (!meta.name) add('low', 'missing_name', 'meta.name is missing or empty');
    if (!meta.description) add('low', 'missing_description', 'meta.description is missing or empty');
    const kw = meta.triggers?.keywords ?? [];
    if (kw.includes('*') || kw.includes('')) add('low', 'wildcard_keyword', 'meta.triggers.keywords contains * or empty string');
  }
  if (Buffer.byteLength(body, 'utf8') > 32 * 1024) {
    add('low', 'oversized_body', 'body > 32 KB');
  }

  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  let verdict: Verdict;
  if (critical > 0) verdict = 'block';
  else if (high >= 2 || score >= 50) verdict = 'block';
  else if (high === 1 || findings.some(f => f.severity === 'medium')) verdict = 'warn';
  else verdict = 'allow';

  return { verdict, score, findings };
}

export function summariseScan(scan: ScanResult): string {
  const top = scan.findings[0]?.rule ?? 'none';
  return `${scan.verdict} · score=${scan.score} · ${scan.findings.length} findings (top: ${top})`;
}
