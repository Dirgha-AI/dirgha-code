// SPDX-License-Identifier: MIT
import { Command } from 'commander';
import chalk from 'chalk';
import { execCmd } from '../utils/safe-exec.js';

interface FeatureConfig {
  brand: string;
  slug: string;
  version: string;
  description: string;
}

const featureMap: Record<string, FeatureConfig> = {
  mesh: {
    brand: 'Bucky',
    slug: 'mesh',
    version: 'v2',
    description: 'Distributed compute mesh network'
  },
  security: {
    brand: 'Arniko',
    slug: 'security',
    version: 'v2',
    description: 'AI-powered security auditing'
  },
  writer: {
    brand: 'Dirgha Writer',
    slug: 'writer',
    version: 'v1.5',
    description: 'Long-form content generation'
  }
};

export function registerComingSoonCommands(program: Command): void {
  Object.entries(featureMap).forEach(([commandName, config]) => {
    program
      .command(commandName)
      .description(`Access ${config.brand} features (${config.version})`)
      .action(() => {
        console.log(chalk.cyan(`\n🚀 ${config.brand}`));
        console.log(chalk.white(`${config.description}`));
        console.log(chalk.yellow(`\nComing in ${config.version}`));
        console.log(chalk.gray(`Track development at https://dirgha.ai/${config.slug}\n`));
        
        const platform = process.platform;
        const openCmd = platform === 'darwin' ? 'open' :
                       platform === 'win32' ? 'cmd' :
                       'xdg-open';
        
        try {
          const url = `https://dirgha.ai/${config.slug}`;
          if (openCmd === 'cmd') execCmd('cmd', ['/c', 'start', url]);
          else execCmd(openCmd, [url]);
        } catch {
          console.log(chalk.gray('Could not open browser automatically'));
        }
      });
  });
}
