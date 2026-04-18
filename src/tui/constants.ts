/** tui/constants.ts — Shared TUI constants */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const SPIN = ['⠁', '⠈', '⠐', '⠠', '⢀', '⡀', '⠄', '⠂'];
export const VERSION = '0.1.0';

export const MODELS = [
  // ── Dirgha (subscription · gateway · cross-provider failover) ──────────
  { id: 'dirgha:minimax',                                    label: 'MiniMax M2.7',         provider: 'gateway',     display: 'Dirgha',      tag: 'best' },
  { id: 'dirgha:llama4',                                     label: 'Llama 4 Maverick',     provider: 'gateway',     display: 'Dirgha',      tag: 'fast' },
  { id: 'dirgha:auto',                                       label: 'Auto (best available)', provider: 'gateway',    display: 'Dirgha',      tag: 'auto' },
  // ── NVIDIA NIM (BYOK · NVIDIA_API_KEY) — primary BYOK provider ─────────
  { id: 'minimaxai/minimax-m2.7',                            label: 'MiniMax M2.7',         provider: 'nvidia',      display: 'NVIDIA',      tag: 'best' },
  { id: 'moonshotai/kimi-k2-instruct-0905',                  label: 'Kimi K2',              provider: 'nvidia',      display: 'NVIDIA',      tag: 'fast' },
  { id: 'minimaxai/minimax-m2.5',                            label: 'MiniMax M2.5',         provider: 'nvidia',      display: 'NVIDIA',      tag: 'fast' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct',           label: 'Llama 4 Maverick',     provider: 'nvidia',      display: 'NVIDIA',      tag: 'full' },
  // ── OpenRouter (BYOK · OPENROUTER_API_KEY) ─────────────────────────────
  { id: 'anthropic/claude-opus-4-7',                         label: 'Claude Opus 4.7',      provider: 'openrouter',  display: 'OpenRouter',  tag: 'best' },
  { id: 'openai/gpt-5.4',                                    label: 'GPT-5.4',              provider: 'openrouter',  display: 'OpenRouter',  tag: 'best' },
  { id: 'qwen/qwen3-coder:free',                             label: 'Qwen3 Coder',          provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'meta-llama/llama-4-scout:free',                     label: 'Llama 4 Scout',        provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'deepseek/deepseek-r1:free',                         label: 'DeepSeek R1',          provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  // ── Anthropic (BYOK · ANTHROPIC_API_KEY) ───────────────────────────────
  { id: 'claude-opus-4-7',                                   label: 'Claude Opus 4.7',      provider: 'anthropic',   display: 'Anthropic',   tag: 'best' },
  { id: 'claude-opus-4-6',                                   label: 'Claude Opus 4.6',      provider: 'anthropic',   display: 'Anthropic',   tag: 'best' },
  { id: 'claude-sonnet-4-6',                                 label: 'Claude Sonnet 4.6',    provider: 'anthropic',   display: 'Anthropic',   tag: 'full' },
  { id: 'claude-haiku-4-5',                                  label: 'Claude Haiku 4.5',     provider: 'anthropic',   display: 'Anthropic',   tag: 'fast' },
  // ── OpenAI (BYOK · OPENAI_API_KEY) ─────────────────────────────────────
  { id: 'gpt-5.4',                                           label: 'GPT-5.4',              provider: 'openai',      display: 'OpenAI',      tag: 'best' },
  { id: 'gpt-5.4-mini',                                      label: 'GPT-5.4 Mini',         provider: 'openai',      display: 'OpenAI',      tag: 'fast' },
  { id: 'o4-mini',                                           label: 'o4-mini',              provider: 'openai',      display: 'OpenAI',      tag: 'fast' },
  // ── Google Gemini (BYOK · GEMINI_API_KEY) ──────────────────────────────
  { id: 'gemini-3.1-pro-preview',                            label: 'Gemini 3.1 Pro',       provider: 'gemini',      display: 'Gemini',      tag: 'best' },
  { id: 'gemini-3.1-flash',                                  label: 'Gemini 3.1 Flash',     provider: 'gemini',      display: 'Gemini',      tag: 'fast' },
  // ── xAI (BYOK · XAI_API_KEY) ───────────────────────────────────────────
  { id: 'grok-4',                                            label: 'Grok 4',               provider: 'xai',         display: 'xAI',         tag: 'best' },
  // ── Groq (BYOK · GROQ_API_KEY) ─────────────────────────────────────────
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct',         label: 'Llama 4 Scout',        provider: 'groq',        display: 'Groq',        tag: 'fast' },
  { id: 'llama-3.3-70b-versatile',                           label: 'Llama 3.3 70B',        provider: 'groq',        display: 'Groq',        tag: 'fast' },
  { id: 'qwen-qwen3-32b',                                    label: 'Qwen3 32B',            provider: 'groq',        display: 'Groq',        tag: 'fast' },
] as const;

// ── Logo palette — swap this object to change the colour scheme ─────────────
// Available built-in palettes: cosmic | obsidian-gold | dirgha-blue | matrix |
//   crimson | nord | sakura | ember | violet-storm | mono-white
// Override at runtime via DIRGHA_LOGO_THEME env var or /theme logo <name>
const LOGO_PALETTE = (() => {
  let name = (typeof process !== 'undefined' && process.env['DIRGHA_LOGO_THEME']) || '';
  if (!name) {
    try {
      const cfgPath = path.join(os.homedir(), '.dirgha', 'config.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      name = cfg.logoTheme ?? '';
    } catch {}
  }
  if (!name) name = 'violet-storm';
  const palettes: Record<string, { border: string; rows: string[]; tag: string }> = {
    'cosmic':        { border: '#FF006E', rows: ['#FB5607','#FFBE0B','#8338EC','#3A86FF','#06FFA5','#FF006E'], tag: '#FFBE0B' },
    'obsidian-gold': { border: '#C47C0A', rows: ['#F5C518','#E8A015','#D4890A','#C47C0A','#F5C518','#FFF8E7'], tag: '#F5C518' },
    'dirgha-blue':   { border: '#0043CE', rows: ['#A6C8FF','#82CFFF','#4589FF','#0F62FE','#0043CE','#A6C8FF'], tag: '#4589FF' },
    'matrix':        { border: '#006B18', rows: ['#39FF14','#00FF41','#00D936','#00B32C','#008F22','#00FF41'], tag: '#39FF14' },
    'crimson':       { border: '#C10023', rows: ['#FFB3C1','#FF6B8A','#FF2952','#DC143C','#C10023','#FF6B8A'], tag: '#FF2952' },
    'nord':          { border: '#5E81AC', rows: ['#88C0D0','#8FBCBB','#81A1C1','#5E81AC','#A3BE8C','#EBCB8B'], tag: '#88C0D0' },
    'sakura':        { border: '#C4306A', rows: ['#FFF0F3','#FFB7C5','#FF85A1','#FF5C8D','#E0457B','#FFB7C5'], tag: '#FF85A1' },
    'ember':         { border: '#FF4500', rows: ['#FFF176','#FFD700','#FFB300','#FF8C00','#FF6A00','#FF4500'], tag: '#FFD700' },
    'violet-storm':  { border: '#5B21B6', rows: ['#EDE9FE','#C4B5FD','#A78BFA','#8B5CF6','#7C3AED','#6D28D9'], tag: '#A78BFA' },
    'mono-white':    { border: '#555555', rows: ['#FFFFFF','#E5E5E5','#CCCCCC','#B3B3B3','#999999','#CCCCCC'],  tag: '#FFFFFF' },
  };
  return palettes[name] ?? palettes['violet-storm']!;
})();

const P = LOGO_PALETTE;

export const LOGO_WIDE = [
  '',
  chalk.hex(P.border)('    ╭──────────────────────────────────────────────────────────╮'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[0]!)('  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[1]!)('  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[2]!)('  ██║  ██║██║██████╔╝██║  ███╗███████║███████║') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[3]!)('  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[4]!)('  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    │') + chalk.hex(P.rows[5]!)('  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝') + chalk.hex(P.border)('│'),
  chalk.hex(P.border)('    ╰──────────────────────────────────────────────────────────╯'),
  '',
  // Tag below the logo: "Dirgha Code  ◈  dirgha.ai · 0.1.0"
  // The ◈ replaces the old ✦/✦ clutter and matches the footer brand mark.
  chalk.hex(P.tag)('    ') + chalk.hex(P.rows[1]!)('Dirgha Code') + chalk.hex(P.tag)('  ◈  ') + chalk.hex(P.rows[2]!)('dirgha.ai') + chalk.hex(P.rows[4]!)(' · ' + VERSION),
  '',
].join('\n');

export const LOGO_COMPACT = [
  '',
  chalk.hex(P.border)('  ◆ ') + chalk.hex(P.rows[0]!)('D') + chalk.hex(P.rows[1]!)('I') + chalk.hex(P.rows[2]!)('R') + chalk.hex(P.rows[3]!)('G') + chalk.hex(P.rows[4]!)('H') + chalk.hex(P.rows[5]!)('A') + chalk.hex(P.border)(' ◆'),
  chalk.hex(P.tag)('  ') + chalk.hex(P.rows[1]!)('Dirgha Code') + chalk.hex(P.tag)('  ◈  ') + chalk.hex(P.rows[2]!)('dirgha.ai') + chalk.hex(P.rows[4]!)(' · ' + VERSION),
  '',
].join('\n');

function loadCustomLogo(): string | null {
  try {
    const cfgPath = path.join(os.homedir(), '.dirgha', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const customPath = cfg.customLogoPath as string;
    if (customPath && fs.existsSync(customPath)) {
      return fs.readFileSync(customPath, 'utf8');
    }
  } catch {}
  return null;
}

export const LOGO = (() => {
  const custom = loadCustomLogo();
  if (custom) return custom;
  // Show wide logo for terminals >= 60 cols, otherwise compact
  // Use 0 as default to prefer wide logo when columns unknown
  const cols = process.stdout.columns ?? 0;
  return cols === 0 || cols >= 60 ? LOGO_WIDE : LOGO_COMPACT;
})();

export const SLASH_COMMANDS = [
  // session
  '/help', '/status', '/clear', '/compact', '/cost', '/tokens', '/save', '/export', '/resume',
  '/copy', '/summary', '/cache', '/workspace', '/credits', '/usage',
  // auth + config
  '/login', '/logout', '/setup', '/local', '/model', '/keys', '/config', '/theme', '/bind', '/soul',
  // dev workflow
  '/spec', '/plan', '/unplan', '/qa', '/review', '/debug', '/tdd', '/fix', '/refactor',
  '/scaffold', '/changes', '/vim', '/reasoning', '/effort', '/fast',
  // git
  '/diff', '/commit', '/stash', '/push', '/branch', '/checkout',
  // memory + knowledge
  '/memory', '/remember', '/recall', '/gc', '/curate', '/what',
  // safety
  '/checkpoint', '/rollback', '/permissions', '/yolo', '/approvals', '/btw',
  // skills + tools
  '/skills', '/init', '/scan', '/secrets',
  // system
  '/verify', '/doctor',
  // integrations
  '/mcp', '/voice', '/cron', '/net', '/drop', '/undo',
  // sprint engine
  '/sprint', '/sprint status', '/sprint pause', '/sprint resume',
  '/sprint log', '/sprint skip', '/sprint abort', '/sprint list', '/run',
];

export const PROV_COLORS: Record<string, string> = {
  gateway:    '#8B5CF6',
  fireworks:  '#FF6B35',
  anthropic:  '#CC785C',
  openai:     '#10A37F',
  gemini:     '#4285F4',
  openrouter: '#4A9EFF',
  nvidia:     '#76B900',
  litellm:    '#A78BFA',
  xai:        '#E5E7EB',
  groq:       '#F97316',
};

export const TAG_COLORS: Record<string, string> = {
  free: '#10B981', fast: '#60A5FA', best: '#F59E0B', big: '#A78BFA', full: '#6B7280', dev: '#EF4444', auto: '#8B5CF6',
};

// Pre-computed model groups for ModelPicker — co-located with source data
function buildGroups(models: typeof MODELS) {
  const order: string[] = [];
  const map: Record<string, Array<typeof MODELS[number] & { num: number }>> = {};
  let num = 0;
  for (const m of models) {
    if (!map[m.provider]) { map[m.provider] = []; order.push(m.provider); }
    map[m.provider]!.push({ ...m, num: ++num });
  }
  return { order, map };
}
export const { order: PROV_ORDER, map: PROV_MAP } = buildGroups(MODELS);

export type MsgRole = 'user' | 'assistant' | 'system' | 'tool' | 'tool-group';

export interface ToolCall {
  name: string;
  label: string;
}

export interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string;
  tool?: string;
  /** For role='tool-group': all tool calls in this turn */
  tools?: ToolCall[];
  tokens?: number;
  model?: string;
  ts: number;
  rendered?: string;
  thinking?: string;
  isLogo?: boolean;
  isDim?: boolean;
}
