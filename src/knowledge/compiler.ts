/**
 * knowledge/compiler.ts — Incremental knowledge compiler (PAL pattern).
 *
 * Processes raw/*.md docs marked compiled:false → wiki/concepts/*.md articles.
 * Additive: never overwrites existing content, enriches it.
 * Source-attributed: every article cites its origin raw doc.
 */
import { getUncompiled, markCompiled, type RawDoc } from './raw.js';
import { getArticle, updateArticle, updateSummary, rebuildIndex } from './wiki.js';
import { runAgentLoop } from '../agent/loop.js';
import { commitWiki } from '../sync/wiki-git.js';

const COMPILE_PROMPT = (doc: RawDoc) => `You are a knowledge compiler. Convert this raw document into a structured wiki article.

Source: ${doc.source}
Title: ${doc.title}
Tags: ${doc.tags.join(', ')}

Content:
${doc.content.slice(0, 4000)}

Output a well-structured markdown article with:
1. A clear H1 title
2. A 1-2 sentence summary at the top
3. Sections with H2 headers for key concepts
4. A "## Source" section citing: "${doc.source}" (id: ${doc.id})
5. Cross-links to related topics (if you know them)

IMPORTANT: Output ONLY the markdown article, no preamble.`;

const SUMMARY_PROMPT = (articleContent: string) => `Write a 200-300 word summary of this knowledge article.
Focus on the key insights and when this knowledge should be applied.
Output ONLY the summary text, no preamble.

Article:
${articleContent.slice(0, 3000)}`;

export interface CompileResult {
  compiled: number;
  failed: number;
  skipped: number;
  articles: string[];  // slugs created/updated
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** Compile one raw document into a wiki article. */
async function compileDoc(doc: RawDoc, model: string, onText?: (t: string) => void): Promise<string> {
  let articleContent = '';
  await runAgentLoop(
    COMPILE_PROMPT(doc),
    [],
    model,
    (t) => { articleContent += t; onText?.(t); },
    () => {},
  );

  const slug = slugify(doc.title);

  // If article exists, append new section rather than overwrite
  const existing = getArticle(slug);
  if (existing) {
    const mergeNote = `\n\n---\n_Updated ${new Date().toISOString().slice(0, 10)} from source: ${doc.source}_\n`;
    updateArticle(slug, existing + mergeNote + articleContent.slice(0, 500));
  } else {
    updateArticle(slug, articleContent);
  }

  // Generate and store summary
  let summaryContent = '';
  await runAgentLoop(
    SUMMARY_PROMPT(articleContent),
    [],
    model,
    (t) => { summaryContent += t; },
    () => {},
  );
  if (summaryContent.trim()) updateSummary(slug, summaryContent);

  return slug;
}

/**
 * Run the compiler: process all uncompiled raw documents.
 * Triggered by /knowledge compile or automatically after ingestion.
 */
export async function runCompiler(
  model: string,
  onProgress?: (msg: string) => void,
): Promise<CompileResult> {
  const uncompiled = getUncompiled();
  const result: CompileResult = { compiled: 0, failed: 0, skipped: 0, articles: [] };

  if (uncompiled.length === 0) {
    onProgress?.('  Nothing to compile — all raw documents are up to date.');
    return result;
  }

  onProgress?.(`  Compiling ${uncompiled.length} documents…`);

  for (const doc of uncompiled) {
    try {
      const slug = await compileDoc(doc, model);
      markCompiled(doc.id);
      result.compiled++;
      result.articles.push(slug);
      onProgress?.(`  ✓ ${doc.title} → ${slug}`);
    } catch (err) {
      result.failed++;
      onProgress?.(`  ✗ ${doc.title}: ${(err as Error).message.slice(0, 60)}`);
    }
  }

  // Rebuild index after compile
  if (result.compiled > 0) {
    rebuildIndex();
    onProgress?.(`  ✓ Index rebuilt (${result.articles.length} articles total)`);
    // Git-commit compiled articles to wiki repo
    const committed = commitWiki(`chore: compile ${result.compiled} article(s) — ${result.articles.slice(0, 3).join(', ')}`);
    if (committed) onProgress?.(`  ✓ Wiki changes committed to git`);
  }

  return result;
}
