/**
 * mcp/marketplace.ts — curated directory of community MCP servers.
 *
 * Each entry is a pointer at something already published on npm /
 * GitHub. We do NOT host or redistribute anyone's server; we just
 * surface them so users can discover and install with one command.
 *
 * To add or update an entry: PR to this file. Keep the list short and
 * audited — the install command runs the server's npm package, so
 * anything in this list is effectively recommended.
 */

export interface MarketplaceEntry {
  /** Short slug, unique. Used as `dirgha mcp marketplace install <id>`. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** One-line description — shown in `dirgha mcp marketplace list`. */
  summary: string;
  /** Detailed description — shown in `info`. */
  description: string;
  /** Tags for filtering. */
  tags: string[];
  /** Who publishes this. */
  author: string;
  /** Homepage / repo URL. */
  homepage: string;
  /** Install command — usually `npx <pkg>` or a full shell line. */
  install: string;
  /** Optional: CLI args appended after install when registering with the local MCP client. */
  args?: string[];
  /** Does the server need user-supplied env vars? List the names so we can prompt. */
  env?: Array<{ name: string; description: string; required: boolean }>;
  /** Official = blessed by the underlying service. Community = third-party. */
  tier: 'official' | 'community';
}

export const MARKETPLACE: MarketplaceEntry[] = [
  // --- File system / local data --------------------------------------------
  {
    id: 'filesystem',
    name: 'Filesystem',
    summary: 'Read, write, and search local files with scoped permissions.',
    description: 'The reference MCP server for filesystem access. Restricts reads and writes to directories you pass as args, with symlink protection and a deny-glob list. Use this when you want Dirgha to operate on a project directory without the user having to re-mount it per session.',
    tags: ['files', 'local', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    install: 'npx -y @modelcontextprotocol/server-filesystem',
    args: ['<path>'],
    tier: 'official',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    summary: 'Query a local SQLite database with parameterized SQL.',
    description: 'Exposes a single SQLite file as read/query tools. Good for letting the agent inspect analytics, session DBs, or any on-disk SQLite store without re-implementing query tools itself.',
    tags: ['database', 'local', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    install: 'npx -y @modelcontextprotocol/server-sqlite',
    args: ['<database.db>'],
    tier: 'official',
  },

  // --- Source control ------------------------------------------------------
  {
    id: 'github',
    name: 'GitHub',
    summary: 'Repos, issues, PRs, and code search via the GitHub API.',
    description: 'Full GitHub API coverage as MCP tools — create PRs, comment, fetch diffs, search code across orgs. Requires a GITHUB_TOKEN.',
    tags: ['vcs', 'remote', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    install: 'npx -y @modelcontextprotocol/server-github',
    env: [
      { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'Fine-grained PAT with repo scope', required: true },
    ],
    tier: 'official',
  },
  {
    id: 'git',
    name: 'Git (local)',
    summary: 'Run safe git operations on a local repository.',
    description: 'Local git server — log, diff, blame, show. Read-only by default. Useful when you want the agent to reason about history without granting shell access.',
    tags: ['vcs', 'local', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    install: 'npx -y @modelcontextprotocol/server-git',
    args: ['--repository', '<path>'],
    tier: 'official',
  },

  // --- Web / knowledge -----------------------------------------------------
  {
    id: 'fetch',
    name: 'Fetch',
    summary: 'HTTP fetch with readability extraction.',
    description: 'Fetches a URL, extracts the main article text, returns it. Replace ad-hoc `curl | html2text` workflows.',
    tags: ['web', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    install: 'npx -y @modelcontextprotocol/server-fetch',
    tier: 'official',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    summary: 'Web + news search via Brave Search API.',
    description: 'No-tracking search results, API-key-gated. Good default web_search replacement when you want ranked results rather than DuckDuckGo HTML scraping.',
    tags: ['web', 'search'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    install: 'npx -y @modelcontextprotocol/server-brave-search',
    env: [
      { name: 'BRAVE_API_KEY', description: 'From api.search.brave.com', required: true },
    ],
    tier: 'official',
  },

  // --- Productivity --------------------------------------------------------
  {
    id: 'google-drive',
    name: 'Google Drive',
    summary: 'Read Drive files and search across your Google account.',
    description: 'Drive file listing + read. OAuth flow handled on first use. Scope to a specific folder via args.',
    tags: ['cloud', 'files', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
    install: 'npx -y @modelcontextprotocol/server-gdrive',
    tier: 'official',
  },
  {
    id: 'slack',
    name: 'Slack',
    summary: 'Read channels + DMs, post messages via bot token.',
    description: 'Good for pairing with a CI agent that posts status or for giving the agent read access to a help channel before it answers.',
    tags: ['messaging', 'work'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    install: 'npx -y @modelcontextprotocol/server-slack',
    env: [
      { name: 'SLACK_BOT_TOKEN', description: 'xoxb-... from a Slack app', required: true },
      { name: 'SLACK_TEAM_ID', description: 'Your workspace team ID', required: true },
    ],
    tier: 'official',
  },

  // --- Browser / Automation ------------------------------------------------
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    summary: 'Headless Chrome automation via Puppeteer.',
    description: 'Full Chromium control — navigate, click, type, screenshot. Similar to Dirgha\'s built-in browser tool but MCP-native so other clients can share it.',
    tags: ['browser', 'automation', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    install: 'npx -y @modelcontextprotocol/server-puppeteer',
    tier: 'official',
  },

  // --- Observability -------------------------------------------------------
  {
    id: 'sentry',
    name: 'Sentry',
    summary: 'Read errors and issues from your Sentry org.',
    description: 'Useful when the agent needs to triage incidents — lists unresolved issues, shows stack traces, filters by project.',
    tags: ['observability', 'incidents'],
    author: 'getsentry',
    homepage: 'https://github.com/getsentry/sentry-mcp',
    install: 'npx -y @sentry/mcp-server',
    env: [
      { name: 'SENTRY_AUTH_TOKEN', description: 'Org auth token', required: true },
    ],
    tier: 'community',
  },

  // --- Data stores ---------------------------------------------------------
  {
    id: 'postgres',
    name: 'PostgreSQL',
    summary: 'Query a Postgres database with parameterized SQL.',
    description: 'Read-only by default. Great for letting the agent inspect production schemas or run analytics queries under a scoped role.',
    tags: ['database', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    install: 'npx -y @modelcontextprotocol/server-postgres',
    args: ['<connection-uri>'],
    tier: 'official',
  },
  {
    id: 'memory',
    name: 'Knowledge Graph Memory',
    summary: 'Persistent entity/relation graph across sessions.',
    description: 'Lightweight graph store the MCP project ships as a reference memory pattern. Add entities, link them, query paths. Complements Dirgha\'s own `save_memory` / `read_memory` by giving cross-client portability.',
    tags: ['memory', 'reference'],
    author: 'modelcontextprotocol',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    install: 'npx -y @modelcontextprotocol/server-memory',
    tier: 'official',
  },
];

export function findEntry(id: string): MarketplaceEntry | undefined {
  return MARKETPLACE.find(e => e.id === id);
}

export function filterEntries(query?: string, tag?: string, tier?: 'official' | 'community'): MarketplaceEntry[] {
  const q = (query ?? '').toLowerCase();
  return MARKETPLACE.filter(e => {
    if (tier && e.tier !== tier) return false;
    if (tag && !e.tags.includes(tag)) return false;
    if (!q) return true;
    return (
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    );
  });
}
