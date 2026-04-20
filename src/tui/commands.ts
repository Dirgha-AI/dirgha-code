/**
 * tui/commands.ts — Slash command catalog.
 *
 * SLASH_COMMAND_SPEC is the typed source-of-truth (name + description + group).
 * SLASH_COMMANDS is a flat string[] derived for legacy autocomplete consumers.
 */

export type SlashGroup =
  | 'session' | 'auth' | 'workflow' | 'git' | 'memory'
  | 'safety' | 'tools' | 'system' | 'integrations' | 'sprint' | 'parallel';

export interface SlashCommandSpec {
  name: string;
  description: string;
  group: SlashGroup;
}

export const SLASH_COMMAND_SPEC: SlashCommandSpec[] = [
  // session
  { name: '/help',       description: 'Show all commands',             group: 'session' },
  { name: '/status',     description: 'Account, quota, sessions',      group: 'session' },
  { name: '/clear',      description: 'Clear screen + conversation',   group: 'session' },
  { name: '/compact',    description: 'Compress conversation',         group: 'session' },
  { name: '/cost',       description: 'Session $ estimate',            group: 'session' },
  { name: '/tokens',     description: 'Token counter',                 group: 'session' },
  { name: '/save',       description: 'Save session',                  group: 'session' },
  { name: '/export',     description: 'Export as md/html/json',        group: 'session' },
  { name: '/resume',     description: 'Resume saved session',          group: 'session' },
  { name: '/copy',       description: 'Copy reply to clipboard',       group: 'session' },
  { name: '/summary',    description: 'AI summary of conversation',    group: 'session' },
  { name: '/cache',      description: 'Prompt cache stats',            group: 'session' },
  { name: '/workspace',  description: 'Cwd, branch, type',             group: 'session' },
  { name: '/credits',    description: 'Credits + quota',               group: 'session' },
  { name: '/usage',      description: 'Billing usage bars',            group: 'session' },

  // auth + config
  { name: '/login',      description: 'Sign in to Dirgha',             group: 'auth' },
  { name: '/logout',     description: 'Clear credentials',             group: 'auth' },
  { name: '/setup',      description: 'Onboarding wizard',             group: 'auth' },
  { name: '/local',      description: 'Local llama.cpp status',        group: 'auth' },
  { name: '/model',      description: 'Switch model / provider',       group: 'auth' },
  { name: '/keys',       description: 'Manage BYOK keys',              group: 'auth' },
  { name: '/config',     description: 'Show/set config',               group: 'auth' },
  { name: '/theme',      description: 'Switch color theme',            group: 'auth' },
  { name: '/bind',       description: 'Keybindings',                   group: 'auth' },
  { name: '/soul',       description: 'Agent persona',                 group: 'auth' },

  // dev workflow
  { name: '/spec',       description: 'Spec-writing skill',            group: 'workflow' },
  { name: '/plan',       description: 'Plan mode (read-only)',         group: 'workflow' },
  { name: '/unplan',     description: 'Exit plan mode',                group: 'workflow' },
  { name: '/qa',         description: 'QA checklist on changes',       group: 'workflow' },
  { name: '/review',     description: 'Code review of changes',        group: 'workflow' },
  { name: '/debug',      description: 'Toggle debug mode',             group: 'workflow' },
  { name: '/tdd',        description: 'TDD skill',                     group: 'workflow' },
  { name: '/fix',        description: 'Auto-fix lint/type/test',       group: 'workflow' },
  { name: '/refactor',   description: 'Clarity refactor',              group: 'workflow' },
  { name: '/scaffold',   description: 'shadcn + Phosphor scaffold',    group: 'workflow' },
  { name: '/changes',    description: 'Files modified this session',   group: 'workflow' },
  { name: '/vim',        description: 'Vim mode toggle',               group: 'workflow' },
  { name: '/reasoning',  description: 'Extended thinking',             group: 'workflow' },
  { name: '/effort',     description: 'low/medium/high',               group: 'workflow' },
  { name: '/fast',       description: 'Brief response mode',           group: 'workflow' },
  { name: '/side',       description: 'Ephemeral sub-agent fork',      group: 'workflow' },
  { name: '/verbose',    description: 'Cycle stream verbosity',        group: 'workflow' },

  // git
  { name: '/diff',       description: 'git diff',                      group: 'git' },
  { name: '/commit',     description: 'Stage + commit',                group: 'git' },
  { name: '/stash',      description: 'Stash management',              group: 'git' },
  { name: '/push',       description: 'Push branch',                   group: 'git' },
  { name: '/branch',     description: 'List/create branch',            group: 'git' },
  { name: '/checkout',   description: 'Checkout branch',               group: 'git' },

  // memory + knowledge
  { name: '/memory',     description: 'Show persistent memory',        group: 'memory' },
  { name: '/remember',   description: 'Save a fact',                   group: 'memory' },
  { name: '/recall',     description: 'Query knowledge graph',         group: 'memory' },
  { name: '/gc',         description: 'Garbage collect',               group: 'memory' },
  { name: '/curate',     description: 'Curate to knowledge graph',     group: 'memory' },

  // safety
  { name: '/checkpoint', description: 'Save restore point',            group: 'safety' },
  { name: '/rollback',   description: 'Restore checkpoint',            group: 'safety' },
  { name: '/permissions', description: 'Set permission level',         group: 'safety' },
  { name: '/yolo',       description: 'Bypass approvals',              group: 'safety' },
  { name: '/approvals',  description: 'Manage pending approvals',      group: 'safety' },
  { name: '/btw',        description: 'Ephemeral question',            group: 'safety' },

  // skills + tools
  { name: '/skills',     description: 'List/enable skills',            group: 'tools' },
  { name: '/init',       description: 'Scan project',                  group: 'tools' },
  { name: '/scan',       description: 'Scan files for issues',         group: 'tools' },
  { name: '/secrets',    description: 'Redact secrets',                group: 'tools' },

  // system
  { name: '/verify',     description: 'System + skills health',        group: 'system' },
  { name: '/doctor',     description: 'Detailed diagnostics',          group: 'system' },

  // integrations
  { name: '/mcp',        description: 'MCP connections',               group: 'integrations' },
  { name: '/voice',      description: 'Voice input',                   group: 'integrations' },
  { name: '/cron',       description: 'Scheduled jobs',                group: 'integrations' },
  { name: '/net',        description: 'Network rules',                 group: 'integrations' },
  { name: '/fs',         description: 'Virtual mount management',      group: 'integrations' },
  { name: '/drop',       description: 'Drop a file/dir from session',  group: 'integrations' },
  { name: '/undo',       description: 'Undo last change',              group: 'integrations' },
  { name: '/screen',     description: 'Take screenshot (macOS)',       group: 'integrations' },
  { name: '/team',       description: 'Agent team management',         group: 'integrations' },
  { name: '/consensus',  description: 'Multi-agent consensus',         group: 'integrations' },

  // sprint engine
  { name: '/sprint',           description: 'Sprint controls',         group: 'sprint' },
  { name: '/sprint status',    description: 'Show sprint status',      group: 'sprint' },
  { name: '/sprint pause',     description: 'Pause sprint',            group: 'sprint' },
  { name: '/sprint resume',    description: 'Resume sprint',           group: 'sprint' },
  { name: '/sprint log',       description: 'Sprint log',              group: 'sprint' },
  { name: '/sprint skip',      description: 'Skip current task',       group: 'sprint' },
  { name: '/sprint abort',     description: 'Abort sprint',            group: 'sprint' },
  { name: '/sprint list',      description: 'List sprints',            group: 'sprint' },
  { name: '/run',              description: 'Run orchestrator',        group: 'sprint' },

  // parallel / multi-agent
  { name: '/orchestrate',      description: 'Plan → Code → Verify',    group: 'parallel' },
];

export const SLASH_COMMANDS: string[] = SLASH_COMMAND_SPEC.map(c => c.name);
