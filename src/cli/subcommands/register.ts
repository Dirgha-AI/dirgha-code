/**
 * `dirgha register` — publish a dirgha-agent.yaml manifest to the Dirgha agent registry.
 *
 * Inspired by Fetch.ai uAgents Almanac registration: every agent auto-registers
 * its capability manifest on startup. This CLI command provides the manual / CI
 * equivalent.
 *
 * Usage:
 *   dirgha register                        Read dirgha-agent.yaml from cwd
 *   dirgha register --manifest <path>      Read manifest from custom path
 *   dirgha register --gateway <url>        Override gateway URL
 *   dirgha register --dry-run              Validate + print without POSTing
 *   dirgha register --token <jwt>          Provide auth token directly
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { loadToken } from '../../integrations/device-auth.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

// ---------------------------------------------------------------------------
// YAML parser — lightweight, handles the specific dirgha-agent.yaml schema.
// js-yaml is not in CLI dependencies, so we implement a purpose-built parser
// that handles: scalars, quoted strings, arrays ([a, b] inline and block -),
// nested mappings, and YAML booleans. Sufficient for the agent manifest.
// ---------------------------------------------------------------------------

type YamlValue = string | number | boolean | null | YamlValue[] | YamlRecord;
type YamlRecord = { [k: string]: YamlValue };

function parseSimpleYaml(text: string): YamlRecord {
  const lines = text.split('\n');
  const root: YamlRecord = {};

  interface Frame {
    indent: number;
    obj: YamlRecord;
    key: string | null; // null = array mode
    arr?: YamlValue[];
  }

  // stack[0] is always the current context
  const stack: Frame[] = [{ indent: -1, obj: root, key: null }];

  function currentObj(): YamlRecord {
    return stack[stack.length - 1].obj;
  }

  function parseScalar(raw: string): YamlValue {
    const s = raw.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    // strip surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function parseInlineArray(raw: string): YamlValue[] {
    // e.g. [text-generation, autonomous] or ["a", "b"]
    const inner = raw.trim().slice(1, -1); // strip [ ]
    if (!inner.trim()) return [];
    return inner.split(',').map(p => parseScalar(p.trim()));
  }

  for (const rawLine of lines) {
    // Skip comments and blank lines
    const commentIdx = rawLine.indexOf('#');
    const line = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;
    if (!line.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Pop stack frames whose indent >= current (we've de-dented)
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      const popped = stack.pop()!;
      // If it was an array frame, assign it to the parent
      if (popped.arr !== undefined && popped.key !== null) {
        const parent = stack[stack.length - 1].obj;
        parent[popped.key] = popped.arr;
      }
    }

    // Block list item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      const top = stack[stack.length - 1];
      if (top.arr !== undefined) {
        top.arr.push(parseScalar(value));
      } else if (top.key !== null) {
        // Start a new array attached to top.key
        const arr: YamlValue[] = [parseScalar(value)];
        const parentObj = top.obj;
        const newFrame: Frame = { indent, obj: parentObj, key: top.key, arr };
        parentObj[top.key] = arr; // will be updated as items are pushed
        stack.push(newFrame);
      }
      continue;
    }

    // Key: value line
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    const obj = currentObj();

    if (!rest) {
      // Mapping — push a new frame for the nested object
      const child: YamlRecord = {};
      obj[key] = child;
      stack.push({ indent, obj: child, key });
    } else if (rest.startsWith('[')) {
      // Inline array
      obj[key] = parseInlineArray(rest);
    } else {
      obj[key] = parseScalar(rest);
    }
  }

  // Drain any remaining array frames
  for (let i = stack.length - 1; i >= 1; i--) {
    const frame = stack[i];
    if (frame.arr !== undefined && frame.key !== null) {
      stack[i - 1].obj[frame.key] = frame.arr;
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

interface AgentManifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    description?: string;
    version: string;
    author?: string;
    tags?: string[];
  };
  spec: {
    capabilities: string[];
    pricing?: { per_call_usdc?: number };
    endpoints?: { path: string; method: string; description?: string; x402_required?: boolean }[];
    registry?: { public?: boolean; searchable?: boolean };
  };
}

function isSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(v);
}

function validateManifest(raw: YamlRecord): { ok: true; manifest: AgentManifest } | { ok: false; error: string } {
  if (raw.apiVersion !== 'dirgha/v1') {
    return { ok: false, error: `apiVersion must be "dirgha/v1", got "${raw.apiVersion}"` };
  }
  if (raw.kind !== 'Agent') {
    return { ok: false, error: `kind must be "Agent", got "${raw.kind}"` };
  }

  const meta = raw.metadata as YamlRecord | undefined;
  if (!meta || typeof meta !== 'object') {
    return { ok: false, error: 'metadata is required' };
  }
  if (typeof meta.name !== 'string' || !/^[a-z0-9-]+$/.test(meta.name)) {
    return { ok: false, error: `metadata.name must match /^[a-z0-9-]+$/, got "${meta.name}"` };
  }
  if (typeof meta.version !== 'string' || !isSemver(meta.version)) {
    return { ok: false, error: `metadata.version must be valid semver, got "${meta.version}"` };
  }

  const spec = raw.spec as YamlRecord | undefined;
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: 'spec is required' };
  }
  if (!Array.isArray(spec.capabilities) || (spec.capabilities as YamlValue[]).length === 0) {
    return { ok: false, error: 'spec.capabilities must be a non-empty array' };
  }

  return { ok: true, manifest: raw as unknown as AgentManifest };
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface RegisterFlags {
  manifestPath: string;
  gateway: string;
  dryRun: boolean;
  update: boolean;
  token: string | null;
  help: boolean;
}

function parseFlags(argv: string[], cwd: string): RegisterFlags {
  const flags: RegisterFlags = {
    manifestPath: join(cwd, 'dirgha-agent.yaml'),
    gateway: process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai',
    dryRun: false,
    update: false,
    token: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--update') {
      flags.update = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--manifest' && argv[i + 1]) {
      flags.manifestPath = argv[++i];
    } else if (arg === '--gateway' && argv[i + 1]) {
      flags.gateway = argv[++i];
    } else if (arg === '--token' && argv[i + 1]) {
      flags.token = argv[++i];
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Subcommand
// ---------------------------------------------------------------------------

const HELP = [
  'Usage:',
  '  dirgha register                        Register agent from dirgha-agent.yaml in cwd',
  '  dirgha register --manifest <path>      Read manifest from custom path',
  '  dirgha register --gateway <url>        Override gateway URL (default: https://api.dirgha.ai)',
  '  dirgha register --dry-run              Validate manifest and print without POSTing',
  '  dirgha register --update              Update an existing agent registration',
  '  dirgha register --token <jwt>          Use provided auth token instead of stored credentials',
  '',
  'The manifest file (dirgha-agent.yaml) must contain:',
  '  apiVersion: dirgha/v1',
  '  kind: Agent',
  '  metadata.name   — lowercase alphanumeric + hyphens',
  '  metadata.version — semver (e.g. 1.0.0)',
  '  spec.capabilities — non-empty array of capability strings',
].join('\n');

export const registerSubcommand: Subcommand = {
  name: 'register',
  aliases: ['reg'],
  description: 'Register a dirgha-agent.yaml manifest with the Dirgha agent registry',

  async run(argv: string[], ctx: { cwd: string }): Promise<number> {
    const flags = parseFlags(argv, ctx.cwd);

    if (flags.help) {
      stdout.write(HELP + '\n');
      return 0;
    }

    // 1. Read manifest file
    let rawText: string;
    try {
      rawText = await readFile(flags.manifestPath, 'utf8');
    } catch {
      stderr.write(
        `${style(defaultTheme.danger, '✗')} Cannot read manifest at ${flags.manifestPath}\n` +
        `  Create a dirgha-agent.yaml in the current directory or use --manifest <path>\n`
      );
      return 1;
    }

    // 2. Parse YAML
    let parsed: YamlRecord;
    try {
      parsed = parseSimpleYaml(rawText);
    } catch (e) {
      stderr.write(`${style(defaultTheme.danger, '✗')} Failed to parse YAML: ${(e as Error).message}\n`);
      return 1;
    }

    // 3. Validate
    const result = validateManifest(parsed);
    if (!result.ok) {
      stderr.write(`${style(defaultTheme.danger, '✗')} Invalid manifest: ${result.error}\n`);
      return 1;
    }
    const manifest = result.manifest;

    // 4. Dry run — print and exit
    if (flags.dryRun) {
      stdout.write(style(defaultTheme.accent, 'dry-run — manifest validated\n\n'));
      stdout.write(JSON.stringify(manifest, null, 2) + '\n');
      stdout.write(style(defaultTheme.muted, `\nWould POST to: ${flags.gateway}/api/registry/agents\n`));
      return 0;
    }

    // 5. Resolve auth token
    let token = flags.token;
    if (!token) {
      const stored = await loadToken();
      if (!stored) {
        stderr.write(
          `${style(defaultTheme.danger, '✗')} Auth required. Run ${style(defaultTheme.accent, 'dirgha auth login')} first.\n`
        );
        return 1;
      }
      token = stored.token;
    }

    // 6. POST/PUT to registry
    const url = flags.update
      ? `${flags.gateway}/api/registry/agents/${manifest.metadata.name}`
      : `${flags.gateway}/api/registry/agents`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: flags.update ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(manifest),
      });
    } catch (e) {
      stderr.write(`${style(defaultTheme.danger, '✗')} Network error: ${(e as Error).message}\n`);
      return 1;
    }

    // 7. Handle response codes
    if (res.status === 401) {
      stderr.write(
        `${style(defaultTheme.danger, '✗')} Auth required. Run ${style(defaultTheme.accent, 'dirgha auth login')} first.\n`
      );
      return 1;
    }

    if (res.status === 404 && flags.update) {
      stderr.write(
        `${style(defaultTheme.danger, '✗')} Agent '${manifest.metadata.name}' not found. ` +
        `Omit --update to register a new agent.\n`
      );
      return 1;
    }

    if (res.status === 409) {
      stderr.write(
        `${style(defaultTheme.danger, '✗')} Agent '${manifest.metadata.name}' already registered. ` +
        `Use ${style(defaultTheme.accent, 'dirgha register --update')} to update.\n`
      );
      return 1;
    }

    if (res.status !== 201) {
      const body = await res.text().catch(() => '');
      stderr.write(`${style(defaultTheme.danger, '✗')} Registry returned ${res.status}: ${body}\n`);
      return 1;
    }

    // 8. Print success
    let data: { id: string; name: string; discoveryUrl: string } | undefined;
    try {
      data = await res.json() as { id: string; name: string; discoveryUrl: string };
    } catch {
      data = undefined;
    }

    const caps = manifest.spec.capabilities.join(', ');
    const price = manifest.spec.pricing?.per_call_usdc != null
      ? `$${manifest.spec.pricing.per_call_usdc}/call`
      : 'free';

    stdout.write(`${style(defaultTheme.success, '✓')} registered ${manifest.metadata.name} (v${manifest.metadata.version})\n`);
    if (data?.id) {
      stdout.write(`  registry id:   ${data.id}\n`);
      stdout.write(`  discovery url: ${data.discoveryUrl ?? `${flags.gateway}/api/registry/agents/${data.id}`}\n`);
    }
    stdout.write(`  capabilities:  ${caps}\n`);
    stdout.write(`  price:         ${price}\n`);

    return 0;
  },
};
