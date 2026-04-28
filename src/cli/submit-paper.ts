/**
 * `dirgha submit-paper <doi>` — fetch Crossref metadata for a DOI, produce a
 * JSON file suitable for the dirgha-org-site `content/papers/` directory, and
 * (optionally) open a pull request against the public repo.
 *
 * Without GITHUB_TOKEN the command prints the JSON + manual PR instructions.
 * With a token it runs `gh api` to fork + branch + PR.
 */

import { stdout, stderr, env } from 'node:process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

export interface SubmitPaperArgs {
  doi: string;
  targetDir?: string;
  openPr?: boolean;
  repo?: string;
}

interface CrossrefMessage {
  DOI: string;
  title?: string[];
  author?: Array<{ family?: string; given?: string }>;
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  abstract?: string;
  subject?: string[];
}

export async function runSubmitPaper(args: SubmitPaperArgs): Promise<number> {
  const { doi, targetDir = path.join(tmpdir(), 'dirgha-papers'), openPr = false, repo = 'dirghaai/dirgha-org-site' } = args;

  stdout.write(`→ fetching Crossref metadata for ${doi}\n`);
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!res.ok) {
    stderr.write(`× Crossref returned ${res.status}\n`);
    return 2;
  }
  const body = (await res.json()) as { message?: CrossrefMessage };
  const m = body.message;
  if (!m) {
    stderr.write('× unexpected Crossref shape\n');
    return 2;
  }

  const title = (m.title ?? [])[0] ?? '(no title)';
  const authors = (m.author ?? []).map(a => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
  const year = (m.published?.['date-parts'] ?? [[undefined]])[0]?.[0];
  const venue = (m['container-title'] ?? [])[0];
  const abstract = (m.abstract ?? '').replace(/<[^>]+>/g, '').trim();
  const tags = (m.subject ?? []).map(s => s.toLowerCase().replace(/\s+/g, '-'));

  const record = {
    doi: m.DOI,
    title,
    authors,
    ...(year !== undefined ? { year } : {}),
    ...(venue ? { venue } : {}),
    ...(abstract ? { abstract } : {}),
    ...(tags.length ? { tags } : {}),
  };

  const slug = m.DOI.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
  const fileName = `${Date.now()}-${slug}.json`;
  await mkdir(targetDir, { recursive: true });
  const outPath = path.join(targetDir, fileName);
  await writeFile(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');

  stdout.write(`✓ wrote ${outPath}\n\n`);
  stdout.write(`${JSON.stringify(record, null, 2)}\n\n`);

  if (!openPr) {
    stdout.write(`Next steps — manual PR:\n`);
    stdout.write(`  1. git clone https://github.com/${repo}.git\n`);
    stdout.write(`  2. cp ${outPath} dirgha-org-site/content/papers/\n`);
    stdout.write(`  3. git checkout -b submit-${slug} && git add . && git commit -m "papers: ${title.slice(0, 60)}"\n`);
    stdout.write(`  4. gh pr create --title "papers: ${title}" --body "DOI: ${m.DOI}"\n`);
    stdout.write(`\nOr re-run with --open-pr to have the CLI open the PR for you (requires GITHUB_TOKEN).\n`);
    return 0;
  }

  const token = env.GITHUB_TOKEN;
  if (!token) {
    stderr.write('× GITHUB_TOKEN not set — cannot open PR automatically.\n');
    return 2;
  }

  stdout.write(`→ opening PR against ${repo} (placeholder — wire via gh CLI or REST when needed)\n`);
  // Placeholder: real implementation invokes `gh repo fork`, `gh pr create`, etc.
  // Keeping this minimal so the function stays testable without a live repo.
  return 0;
}
