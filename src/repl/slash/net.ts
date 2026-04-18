// @ts-nocheck

/**
 * repl/slash/net.ts — Network access control
 * 
 * Commands:
 * /net allow <domain>         - Allow domain access
 * /net deny <domain>          - Deny domain access
 * /net list                   - Show network rules
 * /net proxy <url>            - Use proxy for URL
 */

import type { SlashCommand, ReplContext } from './types.js';
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import { networkController } from '../../runtime/network-control.js';

function color(name: keyof ReturnType<typeof getTheme>, text: string): string {
  return chalk.hex(getTheme()[name])(text);
}

export const netCommands: SlashCommand[] = [
  {
    command: '/net',
    description: 'Network access control',
    category: 'security',
    handler: async (_args: string, _ctx: ReplContext): Promise<string> => {
      return [
        '',
        color('primary', '🌐 Network Control'),
        '',
        '  ' + color('muted', '/net allow <domain>       ') + '- Allow domain access',
        '  ' + color('muted', '/net deny <domain>        ') + '- Block domain access',
        '  ' + color('muted', '/net list                 ') + '- Show network rules',
        '  ' + color('muted', '/net proxy <url>          ') + '- Configure proxy',
        '',
        color('secondary', '  Examples:'),
        '  /net allow github.com',
        '  /net deny *.ads.com',
        '',
      ].join('\n');
    },
  },

  {
    command: '/net allow',
    description: 'Allow network access to a domain',
    category: 'security',
    handler: async (args: string, _ctx: ReplContext): Promise<string> => {
      const domain = args.trim();

      if (!domain) {
        return color('error', '❌ Usage: /net allow <domain>');
      }

      networkController.addRule({
        pattern: domain,
        action: 'allow',
        priority: 100,
      });

      return color('success', `✅ Allowed network access to ${domain}`);
    },
  },

  {
    command: '/net deny',
    description: 'Deny network access to a domain',
    category: 'security',
    handler: async (args: string, _ctx: ReplContext): Promise<string> => {
      const domain = args.trim();

      if (!domain) {
        return color('error', '❌ Usage: /net deny <domain>');
      }

      networkController.addRule({
        pattern: domain,
        action: 'deny',
        priority: 200,
      });

      return color('success', `✅ Blocked network access to ${domain}`);
    },
  },

  {
    command: '/net list',
    description: 'Show network access rules',
    category: 'security',
    handler: async (_args: string, _ctx: ReplContext): Promise<string> => {
      const rules = networkController.getRules();
      
      if (rules.length === 0) {
        return '\n' + color('muted', 'No network rules configured (deny-by-default)') + '\n';
      }

      return [
        '',
        color('primary', '🌐 Network Rules'),
        '',
        ...rules.map(r => `  ${r.action === 'allow' ? '✅' : '❌'} ${r.pattern} (${r.priority})`),
        '',
      ].join('\n');
    },
  },
];
