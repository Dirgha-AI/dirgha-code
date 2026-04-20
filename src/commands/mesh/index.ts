import { Command } from 'commander';
import { handleJoin } from './join.js';
import { handleLeave } from './leave.js';
import { handleStatus } from './status.js';
import { handleQuota } from './quota.js';
import { handleAddMember } from './add-member.js';
import { handleAsk } from './ask.js';
import { handleConsensus } from './consensus.js';
import { handleBilling } from './billing.js';

export function registerMeshCommands(program: Command): void {
  const mesh = program
    .command('mesh')
    .description('Local mesh CPU LLM - Team distributed compute');

  mesh
    .command('join')
    .description('Join team mesh network')
    .requiredOption('-t, --team <id>', 'Team ID')
    .requiredOption('-w, --workspace <id>', 'Workspace ID')
    .option('-c, --cpu <percent>', 'Max CPU to share', '50')
    .option('-m, --memory <gb>', 'Max RAM to share', '4')
    .option('-p, --port <number>', 'P2P listen port', '0')
    .action(handleJoin);

  mesh
    .command('leave')
    .description('Gracefully leave mesh network')
    .action(handleLeave);

  mesh
    .command('status')
    .description('Show mesh pool status and resources')
    .action(handleStatus);

  mesh
    .command('quota')
    .description('Show your quota usage and remaining')
    .option('-m, --member <id>', 'Check quota for member (admin only)')
    .action((options) => handleQuota(options.member));

  mesh
    .command('add-member')
    .description('Add team member (admin only)')
    .requiredOption('-i, --id <id>', 'Member ID')
    .requiredOption('-n, --name <name>', 'Member name')
    .requiredOption('-e, --email <email>', 'Email')
    .requiredOption('-r, --role <role>', 'Role (admin/senior/developer/intern)')
    .option('--quota <number>', 'Daily token quota')
    .action(handleAddMember);

  mesh
    .command('ask')
    .description('Ask LLM via mesh pool')
    .argument('<prompt>', 'Question or prompt')
    .option('-m, --model <name>', 'Model to use', 'gemma-4')
    .option('--max-tokens <number>', 'Max tokens', '2048')
    .option('-t, --temperature <number>', 'Temperature', '0.7')
    .option('-p, --priority <level>', 'Priority (low/normal/high)', 'normal')
    .action(handleAsk);

  mesh
    .command('consensus')
    .description('Show consensus engine stats')
    .action(handleConsensus);

  mesh
    .command('billing')
    .description('Show team billing summary')
    .action(handleBilling);
}

export * from './types.js';
export * from './context.js';
