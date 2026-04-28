/**
 * `dirgha scaffold "<prompt>"` — instant-app scaffolder.
 *
 * Closes Gap B from docs/audit/2026-04-28-cursor-bolt-parity.md (Bolt-style
 * "prompt → runnable web app in 30s"). The flow:
 *
 *   1. Pick a template that best matches the prompt (vite-react, vite-vue,
 *      next, hono-api, fastapi, astro). The picker is rule-based — short
 *      list, recognisable keywords. No LLM round-trip required for v1.
 *   2. Copy the template tree into <cwd>/<name>/ (or --target).
 *   3. Optionally personalise via `dirgha ask` (skipped with --no-ai).
 *   4. Run `npm install` (or `pip install -r`) in the new dir.
 *   5. Print the dev-server command and (if --serve) start it.
 *
 *   dirgha scaffold "todo app with React"               # picks vite-react
 *   dirgha scaffold "Hono API with Drizzle" --name=api  # picks hono-api, names it 'api'
 *   dirgha scaffold "static blog" --template=astro       # explicit override
 *   dirgha scaffold "vue dashboard" --no-install --no-ai # skeleton only
 *   dirgha scaffold "next saas" --serve                  # auto npm run dev
 *
 * Templates live at scaffold/templates/<name>/. Each template ships
 * package.json + a starter component file. The user can then iterate
 * on it by running `dirgha ask` in the new directory.
 */
import type { Subcommand } from './index.js';
export declare const scaffoldSubcommand: Subcommand;
