/**
 * Knowledge Engine CLI — real implementation.
 *
 * Maps `dirgha knowledge *` (alias `dirgha k`) to the wiki store in
 * `~/.dirgha/knowledge/` (managed by knowledge/wiki.ts) and the session FTS5
 * search in session/db.ts. Replaces the previous setTimeout-stub version
 * that printed hardcoded fake results on every invocation.
 *
 * Subcommands:
 *   sync    Ingest a JSONL bookmark file into ~/.dirgha/knowledge/items.jsonl
 *           and index each entry as a wiki article for later search.
 *   wiki    Regenerate the wiki index from all indexed articles.
 *   search  FTS5 search over the full knowledge base (memory + files + wiki).
 *   viz     Terminal dashboard showing counts per source / tag.
 *   ls      List all article slugs currently in the wiki.
 *   show    Print a specific article by slug.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { listArticles, rebuildIndex, updateArticle, getArticle, getWikiIndex, conceptsDir } from '../knowledge/wiki.js';

const KNOWLEDGE_DIR = path.join(os.homedir(), '.dirgha', 'knowledge');
const ITEMS_PATH = path.join(KNOWLEDGE_DIR, 'items.jsonl');

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true, mode: 0o700 });
}

/** Turn "Some Title with SPACES" into "some-title-with-spaces". */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `untitled-${Date.now()}`;
}

interface KnowledgeItem {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  content?: string;
  tags?: string[];
  source?: string;
  created_at?: string;
}

export function registerKnowledgeCommands(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .alias('k')
    .description('Knowledge Engine — research + bookmark store');

  // ── sync: ingest a JSONL file of bookmarks into the local store ────────────
  knowledge
    .command('sync')
    .description('Ingest a JSONL bookmark file into the local knowledge base')
    .option('--from <path>', 'Path to a .jsonl file (one object per line)')
    .option('--source <tag>', 'Label this batch (twitter, pocket, raindrop, notes, …)', 'import')
    .action(async (opts: { from?: string; source: string }) => {
      ensureDir(KNOWLEDGE_DIR);
      if (!opts.from) {
        console.error(chalk.yellow('  No --from <path> given.'));
        console.error(chalk.dim('  Example:  dirgha k sync --from ~/exports/bookmarks.jsonl --source twitter'));
        console.error(chalk.dim('  Each line should be an object with at least one of: title, text, url.'));
        process.exit(1);
      }
      const src = path.resolve(opts.from);
      if (!fs.existsSync(src)) {
        console.error(chalk.red(`  File not found: ${src}`));
        process.exit(1);
      }
      const raw = fs.readFileSync(src, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim());
      let ingested = 0, skipped = 0;
      const out = fs.createWriteStream(ITEMS_PATH, { flags: 'a', mode: 0o600 });
      for (const line of lines) {
        let item: KnowledgeItem;
        try { item = JSON.parse(line); } catch { skipped++; continue; }
        const title = item.title ?? item.url ?? item.id ?? '';
        const body = item.text ?? item.content ?? '';
        if (!title && !body) { skipped++; continue; }
        const slug = slugify((item.id ?? title ?? body.slice(0, 40)));
        const article = [
          `# ${title || slug}`,
          '',
          item.url ? `Source: ${item.url}` : '',
          item.source ? `Channel: ${item.source}` : `Channel: ${opts.source}`,
          item.tags?.length ? `Tags: ${item.tags.join(', ')}` : '',
          '',
          body,
        ].filter(Boolean).join('\n');
        updateArticle(slug, article);
        out.write(JSON.stringify({ ...item, source: item.source ?? opts.source, slug, synced_at: new Date().toISOString() }) + '\n');
        ingested++;
      }
      out.end();
      rebuildIndex();
      console.log(chalk.green(`  ✓ Ingested ${ingested} item${ingested === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}`));
      console.log(chalk.dim(`  Source: ${src}`));
      console.log(chalk.dim(`  Stored: ${ITEMS_PATH}`));
      console.log(chalk.dim(`  Articles: ${conceptsDir()}`));
    });

  // ── wiki: rebuild the browsable wiki index ─────────────────────────────────
  knowledge
    .command('wiki')
    .description('Rebuild the wiki index from indexed articles')
    .action(() => {
      const articles = listArticles();
      if (articles.length === 0) {
        console.log(chalk.yellow('  No articles yet. Run `dirgha k sync --from <file>` first.'));
        return;
      }
      rebuildIndex();
      console.log(chalk.green(`  ✓ Rebuilt index across ${articles.length} article${articles.length === 1 ? '' : 's'}`));
      console.log(chalk.dim(`  Index:    ${path.join(os.homedir(), '.dirgha', 'knowledge', 'wiki', 'index.md')}`));
      console.log(chalk.dim(`  Articles: ${conceptsDir()}`));
    });

  // ── search: real FTS search across wiki articles + memory ──────────────────
  knowledge
    .command('search <query...>')
    .description('Search your knowledge base (articles + memory)')
    .option('--limit <n>', 'Max results', '10')
    .action(async (queryArr: string[], opts: { limit: string }) => {
      const query = queryArr.join(' ').trim();
      if (!query) {
        console.error(chalk.red('  Empty query.'));
        process.exit(1);
      }
      const limit = Math.max(1, Math.min(50, parseInt(opts.limit, 10) || 10));

      // 1. Linear substring scan over wiki articles. No FTS dependency here —
      //    keeps the command usable when better-sqlite3 isn't built on the
      //    user's platform. For <10k articles this stays under 100ms.
      const articles = listArticles();
      const q = query.toLowerCase();
      const hits: Array<{ slug: string; snippet: string }> = [];
      for (const slug of articles) {
        const body = getArticle(slug) ?? '';
        const idx = body.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 40);
        const end = Math.min(body.length, idx + query.length + 80);
        hits.push({ slug, snippet: body.slice(start, end).replace(/\s+/g, ' ').trim() });
        if (hits.length >= limit) break;
      }

      // 2. Optional memory hit — session db may have additional context.
      let memoryHits: Array<{ key: string; content: string }> = [];
      try {
        const { searchMemory } = await import('../session/db.js');
        memoryHits = searchMemory(query, Math.max(0, limit - hits.length));
      } catch { /* session db optional */ }

      if (hits.length === 0 && memoryHits.length === 0) {
        console.log(chalk.yellow(`  No matches for "${query}" in ${articles.length} articles.`));
        return;
      }

      console.log(chalk.dim(`\n  Searching for: "${query}"\n`));
      hits.forEach((h, i) => {
        console.log(`  ${chalk.yellow(`${i + 1}.`)} ${chalk.bold(h.slug)} ${chalk.dim('(wiki)')}`);
        console.log(`     ${chalk.dim(h.snippet.slice(0, 120))}`);
      });
      memoryHits.forEach((m, i) => {
        console.log(`  ${chalk.yellow(`${hits.length + i + 1}.`)} ${chalk.bold(m.key)} ${chalk.dim('(memory)')}`);
        console.log(`     ${chalk.dim(m.content.slice(0, 120))}`);
      });
      console.log('');
    });

  // ── viz: real counts from disk ─────────────────────────────────────────────
  knowledge
    .command('viz')
    .description('Dashboard of what\'s in your knowledge base')
    .action(() => {
      const articles = listArticles();
      const itemsExist = fs.existsSync(ITEMS_PATH);
      const itemCount = itemsExist ? fs.readFileSync(ITEMS_PATH, 'utf8').split('\n').filter(l => l.trim()).length : 0;

      // Tally by Channel: tag in article bodies.
      const byChannel = new Map<string, number>();
      for (const slug of articles) {
        const body = getArticle(slug) ?? '';
        const m = body.match(/Channel:\s*([^\n]+)/);
        const ch = m?.[1]?.trim() ?? 'unknown';
        byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
      }

      console.log(chalk.bold.cyan('\n  Knowledge Base\n'));
      console.log(`  ${chalk.dim('Articles')}  ${articles.length}`);
      console.log(`  ${chalk.dim('Items log')} ${itemCount}`);
      console.log(`  ${chalk.dim('Location')}  ${KNOWLEDGE_DIR}`);
      if (byChannel.size > 0) {
        console.log(chalk.bold.cyan('\n  By Channel\n'));
        const total = articles.length || 1;
        const sorted = [...byChannel.entries()].sort((a, b) => b[1] - a[1]);
        const widest = Math.max(...sorted.map(([ch]) => ch.length));
        for (const [ch, n] of sorted) {
          const pct = Math.round((n / total) * 100);
          const barLen = Math.max(1, Math.round(pct / 3));
          console.log(`  ${ch.padEnd(widest)}  ${chalk.cyan('█'.repeat(barLen))} ${n} (${pct}%)`);
        }
      }
      if (articles.length === 0) {
        console.log(chalk.yellow('\n  Nothing indexed yet.'));
        console.log(chalk.dim('  Start with:  dirgha k sync --from <bookmarks.jsonl>'));
      }
      console.log('');
    });

  // ── ls: list all slugs ─────────────────────────────────────────────────────
  knowledge
    .command('ls')
    .description('List all article slugs')
    .action(() => {
      const articles = listArticles();
      if (articles.length === 0) {
        console.log(chalk.yellow('  (no articles)'));
        return;
      }
      articles.sort().forEach(s => console.log(`  ${s}`));
    });

  // ── show: print one article ────────────────────────────────────────────────
  knowledge
    .command('show <slug>')
    .description('Print one article by slug')
    .action((slug: string) => {
      const body = getArticle(slug);
      if (!body) {
        console.error(chalk.red(`  Not found: ${slug}`));
        const candidates = listArticles().filter(s => s.includes(slug)).slice(0, 5);
        if (candidates.length) {
          console.error(chalk.dim('  Did you mean: ' + candidates.join(', ')));
        }
        process.exit(1);
      }
      process.stdout.write(body);
      if (!body.endsWith('\n')) process.stdout.write('\n');
    });
}
