/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface DirghaConfig {
  model: string;
  cheapModel: string;
  summaryModel: string;
  maxTurns: number;
  temperature?: number;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  showThinking: boolean;
  autoApproveTools: string[];
  skills: { enabled: boolean; explicit?: string[] };
  smartRoute: { enabled: boolean };
  compaction: { triggerTokens: number; preserveLastTurns: number };
  telemetry: { enabled: boolean };
  /**
   * When true, InputBox honours vim-style NORMAL / INSERT modes. Esc
   * enters NORMAL; `i` returns to INSERT. Defaults to false so the
   * stock experience is unchanged.
   */
  vimMode?: boolean;
}

export const DEFAULT_CONFIG: DirghaConfig = {
  model: 'moonshotai/kimi-k2-instruct',
  cheapModel: 'meta/llama-3.1-8b-instruct',
  summaryModel: 'moonshotai/kimi-k2-instruct',
  maxTurns: 16,
  showThinking: false,
  autoApproveTools: ['fs_read', 'fs_ls', 'search_grep', 'search_glob', 'git'],
  skills: { enabled: true },
  smartRoute: { enabled: false },
  compaction: { triggerTokens: 120_000, preserveLastTurns: 6 },
  telemetry: { enabled: false },
};

export async function loadConfig(cwd: string = process.cwd()): Promise<DirghaConfig> {
  const userPath = join(homedir(), '.dirgha', 'config.json');
  const projectPath = join(cwd, '.dirgha', 'config.json');

  const userPartial = await readJson(userPath);
  const projectPartial = await readJson(projectPath);
  const envPartial = readEnvOverrides();

  return merge(DEFAULT_CONFIG, userPartial, projectPartial, envPartial);
}

async function readJson(path: string): Promise<Partial<DirghaConfig>> {
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (!text) return {};
  try { return JSON.parse(text) as Partial<DirghaConfig>; } catch { return {}; }
}

function readEnvOverrides(): Partial<DirghaConfig> {
  const out: Partial<DirghaConfig> = {};
  if (process.env.DIRGHA_MODEL) out.model = process.env.DIRGHA_MODEL;
  if (process.env.DIRGHA_CHEAP_MODEL) out.cheapModel = process.env.DIRGHA_CHEAP_MODEL;
  if (process.env.DIRGHA_MAX_TURNS) out.maxTurns = Number.parseInt(process.env.DIRGHA_MAX_TURNS, 10);
  if (process.env.DIRGHA_SHOW_THINKING === '1') out.showThinking = true;
  return out;
}

function merge(...partials: Array<Partial<DirghaConfig>>): DirghaConfig {
  const out: DirghaConfig = structuredClone(DEFAULT_CONFIG);
  for (const p of partials) {
    if (!p) continue;
    for (const key of Object.keys(p) as Array<keyof DirghaConfig>) {
      const value = p[key];
      if (value === undefined) continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        (out[key] as unknown) = { ...(out[key] as object), ...(value as object) };
      } else {
        (out[key] as unknown) = value;
      }
    }
  }
  return out;
}
