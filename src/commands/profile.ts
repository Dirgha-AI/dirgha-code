// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import { readCredentials, isLoggedIn } from '../utils/credentials.js';

const API = process.env.DIRGHA_API_URL || 'https://api.dirgha.ai';

export function registerProfileCommand(program: Command): void {
  const profile = program
    .command('profile')
    .description('Manage your Dirgha profile');

  profile
    .command('view')
    .description('View profile details')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        console.log(chalk.red('Error: Not authenticated. Run `dirgha login` first.'));
        process.exit(1);
      }
      
      try {
        const creds = readCredentials()!;
        const res = await fetch(`${API}/api/profile`, {
          headers: { 'Authorization': `Bearer ${creds.token}` }
        });
        
        if (!res.ok) throw new Error('Failed to fetch profile');
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(chalk.cyan('\n📋 Profile\n'));
          console.log(`Email: ${data.email}`);
          console.log(`User ID: ${data.user_id}`);
          if (data.bio) console.log(`Bio: ${data.bio}`);
          if (data.hourly_rate) console.log(`Hourly Rate: $${data.hourly_rate}`);
          if (data.timezone) console.log(`Timezone: ${data.timezone}`);
          if (data.skills?.length) console.log(`Skills: ${data.skills.join(', ')}`);
          console.log();
        }
      } catch (err) {
        console.log(chalk.red('Failed to load profile'));
        process.exit(1);
      }
    });

  profile
    .command('update')
    .description('Update profile fields')
    .option('--skill <skill>', 'Add skill (repeatable)', collect, [])
    .option('--hourly <n>', 'Set hourly rate', parseFloat)
    .option('--bio <s>', 'Set bio')
    .option('--timezone <tz>', 'Set timezone')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        console.log(chalk.red('Error: Not authenticated. Run `dirgha login` first.'));
        process.exit(1);
      }
      
      const body: Record<string, unknown> = {};
      if (options.skill.length) body.skills = options.skill;
      if (options.hourly !== undefined) body.hourly_rate = options.hourly;
      if (options.bio) body.bio = options.bio;
      if (options.timezone) body.timezone = options.timezone;
      
      try {
        const creds = readCredentials()!;
        const res = await fetch(`${API}/api/profile`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${creds.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error('Failed to update profile');
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(chalk.green('✓ Profile updated successfully'));
        }
      } catch (err) {
        console.log(chalk.red('Failed to update profile'));
        process.exit(1);
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
