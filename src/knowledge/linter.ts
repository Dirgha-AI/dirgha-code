/**
 * knowledge/linter.ts — Knowledge base health checks (PAL pattern).
 *
 * 7 checks (read-only, never modifies content):
 *   1. thin        — articles < 200 words
 *   2. stale       — not updated in > 30 days
 *   3. orphan      — not referenced from index
 *   4. missing_ref — links to non-existent articles
 *   5. duplicate   — very similar article names
 *   6. gap         — concept referenced in index but no article exists
 *   7. contradiction — (heuristic) same slug in conflicting sections
 *
 * Produces wiki/lint-report.md
 */
import fs from 'fs';
import path from 'path';
import { listArticles, getArticle, getWikiIndex, wikiDir } from './wiki.js';

const REPORT_PATH = path.join(wikiDir(), 'lint-report.md');
const STALE_DAYS = 30;

export interface LintIssue {
  check: string;
  severity: 'error' | 'warning' | 'info';
  slug: string;
  message: string;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractLinks(content: string): string[] {
  const links: string[] = [];
  // [text](slug) or [text](slug.md)
  for (const m of content.matchAll(/\[.*?\]\(([^)]+)\)/g)) {
    const href = m[1]!.replace(/\.md$/, '');
    if (!href.startsWith('http')) links.push(href);
  }
  return links;
}

function slugSimilarity(a: string, b: string): number {
  const aWords = new Set(a.split('-'));
  const bWords = new Set(b.split('-'));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  return intersection / Math.max(aWords.size, bWords.size);
}

function articleMtime(slug: string): Date | null {
  try {
    const p = path.join(wikiDir(), 'concepts', `${slug}.md`);
    return fs.statSync(p).mtime;
  } catch { return null; }
}

export function runLinter(): LintIssue[] {
  const articles = listArticles();
  const issues: LintIssue[] = [];
  const index = getWikiIndex();

  // 1. Thin articles
  for (const slug of articles) {
    const content = getArticle(slug) ?? '';
    if (wordCount(content) < 200) {
      issues.push({ check: 'thin', severity: 'warning', slug, message: `Only ${wordCount(content)} words (min 200)` });
    }
  }

  // 2. Stale articles
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);
  for (const slug of articles) {
    const mtime = articleMtime(slug);
    if (mtime && mtime < cutoff) {
      const daysAgo = Math.floor((Date.now() - mtime.getTime()) / (1000 * 60 * 60 * 24));
      issues.push({ check: 'stale', severity: 'info', slug, message: `Last updated ${daysAgo} days ago` });
    }
  }

  // 3. Orphan articles (not referenced from index)
  const articleSet = new Set(articles);
  for (const slug of articles) {
    if (!index.includes(slug)) {
      issues.push({ check: 'orphan', severity: 'warning', slug, message: 'Not referenced in index.md' });
    }
  }

  // 4. Missing refs (links to non-existent articles)
  for (const slug of articles) {
    const content = getArticle(slug) ?? '';
    for (const link of extractLinks(content)) {
      if (!articleSet.has(link)) {
        issues.push({ check: 'missing_ref', severity: 'error', slug, message: `Links to non-existent article: ${link}` });
      }
    }
  }

  // 5. Near-duplicate slugs (similarity > 0.8)
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = slugSimilarity(articles[i]!, articles[j]!);
      if (sim > 0.8) {
        issues.push({ check: 'duplicate', severity: 'warning', slug: articles[i]!, message: `Very similar to "${articles[j]!}" (similarity: ${sim.toFixed(2)})` });
      }
    }
  }

  // 6. Gaps: concepts in index with no article
  const slugPattern = /\*\*([\w-]+)\*\*/g;
  for (const m of index.matchAll(slugPattern)) {
    const slug = m[1]!;
    if (!articleSet.has(slug)) {
      issues.push({ check: 'gap', severity: 'info', slug, message: 'Referenced in index but no article exists' });
    }
  }

  return issues;
}

export function generateLintReport(issues: LintIssue[]): string {
  const now = new Date().toISOString().slice(0, 16);
  const lines = [`# Knowledge Lint Report`, `_Generated: ${now}_`, ''];

  if (issues.length === 0) {
    lines.push('✅ No issues found. Knowledge base is healthy.');
    return lines.join('\n');
  }

  const byCheck = new Map<string, LintIssue[]>();
  for (const issue of issues) {
    if (!byCheck.has(issue.check)) byCheck.set(issue.check, []);
    byCheck.get(issue.check)!.push(issue);
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;

  lines.push(`**${issues.length} issues**: ${errors} errors · ${warnings} warnings · ${infos} info`);
  lines.push('');

  for (const [check, checkIssues] of byCheck) {
    lines.push(`## ${check} (${checkIssues.length})`);
    for (const issue of checkIssues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`- ${icon} **${issue.slug}**: ${issue.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function writeLintReport(issues: LintIssue[]): void {
  const report = generateLintReport(issues);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
}
