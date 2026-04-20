/**
 * Mesh CLI Commands - dirgha mesh join/leave/status/quota
 * Commands for team mesh management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { MeshNode, type MeshNodeConfig } from '../mesh/MeshNode.js';
import { TeamResourcePool, type TeamMember } from '../mesh/TeamResourcePool.js';
import { LightningBilling } from '../mesh/LightningBilling.js';
import { ConsensusEngine } from '../mesh/ConsensusEngine.js';

interface MeshContext {
  node?: MeshNode;
  pool?: TeamResourcePool;
  billing?: LightningBilling;
  consensus?: ConsensusEngine;
}

let context: MeshContext = {};

export function registerMeshCommands(program: Command): void {
  const mesh = program
    .command('mesh')
    .description('Local mesh CPU LLM - Team distributed compute');

  // mesh join
  mesh
    .command('join')
    .description('Join team mesh network')
    .requiredOption('-t, --team <id>', 'Team ID')
    .requiredOption('-w, --workspace <id>', 'Workspace ID')
    .option('-c, --cpu <percent>', 'Max CPU to share', '50')
    .option('-m, --memory <gb>', 'Max RAM to share', '4')
    .option('-p, --port <number>', 'P2P listen port', '0')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🌐 Joining mesh network...'));

        const config: MeshNodeConfig = {
          teamId: options.team,
          workspaceId: options.workspace,
          nodeId: '', // Will be set by libp2p
          maxCpuPercent: parseInt(options.cpu),
          maxMemoryGb: parseInt(options.memory),
          ollamaPort: 11434,
          listenPort: parseInt(options.port),
        };

        context.node = new MeshNode(config);
        
        context.node.on('started', (data) => {
          console.log(chalk.green(`✅ Mesh node started: ${data.nodeId}`));
          console.log(chalk.gray(`   Team: ${options.team}`));
          console.log(chalk.gray(`   Workspace: ${options.workspace}`));
          console.log(chalk.gray(`   Resources: ${options.cpu}% CPU, ${options.memory}GB RAM`));
        });

        context.node.on('peer:discovered', (data) => {
          console.log(chalk.blue(`🔍 Discovered peer: ${data.peerId.slice(0, 16)}...`));
        });

        context.node.on('peer:connected', (data) => {
          console.log(chalk.green(`🔗 Connected to: ${data.peerId.slice(0, 16)}...`));
        });

        await context.node.start();

        // Initialize team pool
        context.pool = new TeamResourcePool(
          options.team,
          options.workspace,
          context.node
        );

        // Initialize billing
        context.billing = new LightningBilling(options.team);

        // Initialize consensus
        context.consensus = new ConsensusEngine();

        console.log(chalk.green('\n✨ Mesh ready! Use "dirgha mesh status" to check pool'));

      } catch (error) {
        console.error(chalk.red('❌ Failed to join mesh:'), error);
        process.exit(1);
      }
    });

  // mesh leave
  mesh
    .command('leave')
    .description('Gracefully leave mesh network')
    .action(async () => {
      if (!context.node) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      console.log(chalk.blue('👋 Leaving mesh network...'));
      await context.node.stop();
      context = {};
      console.log(chalk.green('✅ Left mesh'));
    });

  // mesh status
  mesh
    .command('status')
    .description('Show mesh pool status and resources')
    .action(() => {
      if (!context.node || !context.pool) {
        console.log(chalk.yellow('⚠️  Not connected to mesh. Run "dirgha mesh join" first'));
        return;
      }

      const resources = context.node.getAggregatedResources();
      const peers = context.node.getPeers();
      const metrics = context.pool.getMetrics();

      console.log(chalk.bold.blue('\n📊 Mesh Pool Status\n'));

      // Resource table
      const resTable = new Table({
        head: [chalk.bold('Resource'), chalk.bold('Available')],
        colWidths: [20, 30],
      });

      resTable.push(
        ['CPU Cores', chalk.green(resources.cpuCores.toString())],
        ['Total Memory', chalk.green(`${resources.totalMemoryGb} GB`)],
        ['Available RAM', chalk.green(`${resources.availableMemoryGb} GB`)],
        ['GPUs', chalk.green(resources.gpuCount.toString())],
        ['Models Cached', chalk.cyan(resources.models.join(', ') || 'None')]
      );

      console.log(resTable.toString());

      // Peer table
      console.log(chalk.bold.blue('\n🖥️  Connected Peers\n'));
      
      const peerTable = new Table({
        head: [chalk.bold('Node ID'), chalk.bold('Cores'), chalk.bold('RAM'), chalk.bold('Status')],
        colWidths: [25, 10, 10, 15],
      });

      // Add local node
      peerTable.push([
        chalk.green(context.node['config'].nodeId.slice(0, 20) + '... (you)'),
        'local',
        'local',
        chalk.green('online'),
      ]);

      // Add peers
      peers.forEach(peer => {
        peerTable.push([
          peer.id.slice(0, 20) + '...',
          peer.resources.cpuCores.toString(),
          `${peer.resources.availableMemoryGb}GB`,
          peer.isOnline ? chalk.green('online') : chalk.gray('offline'),
        ]);
      });

      console.log(peerTable.toString());

      // Metrics
      console.log(chalk.bold.blue('\n📈 Pool Metrics\n'));
      console.log(`  Nodes Online: ${chalk.green(metrics.onlineNodes)}/${metrics.totalNodes}`);
      console.log(`  Active Inferences: ${chalk.yellow(metrics.activeInferences)}`);
      console.log(`  Queue Depth: ${chalk.gray(metrics.queueDepth)}`);
      console.log(`  Avg Latency: ${chalk.cyan(metrics.avgLatencyMs)}ms`);
      console.log(`  Throughput: ${chalk.cyan(metrics.tokensPerSecond)} tok/sec`);
    });

  // mesh quota
  mesh
    .command('quota')
    .description('Show your quota usage and remaining')
    .option('-m, --member <id>', 'Check quota for member (admin only)')
    .action((options) => {
      if (!context.pool) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      // In real implementation, get current user ID from auth
      const memberId = options.member || 'current-user';
      
      const quotas = context.pool.getQuotaStatus();
      const quota = quotas.find(q => q.memberId === memberId);

      if (!quota) {
        console.log(chalk.yellow(`⚠️  No quota found for ${memberId}`));
        return;
      }

      const member = context.pool['members'].get(memberId);
      const percentUsed = (quota.tokensUsed / (quota.tokensUsed + quota.tokensRemaining)) * 100;

      console.log(chalk.bold.blue(`\n📊 Quota for ${member?.name || memberId}\n`));
      console.log(`  Role: ${chalk.cyan(member?.role || 'unknown')}`);
      console.log(`  Daily Limit: ${chalk.green((quota.tokensUsed + quota.tokensRemaining).toLocaleString())} tokens`);
      console.log(`  Used: ${chalk.yellow(quota.tokensUsed.toLocaleString())} (${percentUsed.toFixed(1)}%)`);
      console.log(`  Remaining: ${chalk.green(quota.tokensRemaining.toLocaleString())}`);
      console.log(`  Cost Accrued: $${chalk.cyan(quota.costAccrued.toFixed(4))}`);
      console.log(`  Last Reset: ${quota.lastReset.toLocaleDateString()}`);

      // Progress bar
      const barWidth = 30;
      const filled = Math.floor((percentUsed / 100) * barWidth);
      const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
      console.log(`\n  ${bar}`);
    });

  // mesh add-member
  mesh
    .command('add-member')
    .description('Add team member (admin only)')
    .requiredOption('-i, --id <id>', 'Member ID')
    .requiredOption('-n, --name <name>', 'Member name')
    .requiredOption('-e, --email <email>', 'Email')
    .requiredOption('-r, --role <role>', 'Role (admin/senior/developer/intern)')
    .option('--quota <number>', 'Daily token quota')
    .action((options) => {
      if (!context.pool) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      const member: TeamMember = {
        id: options.id,
        name: options.name,
        email: options.email,
        role: options.role,
        dailyTokenQuota: parseInt(options.quota) || 0,
        monthlyCostQuota: 0,
        canShareCompute: true,
        canUseMesh: true,
      };

      context.pool.addMember(member);
      console.log(chalk.green(`✅ Added member: ${options.name} (${options.role})`));
    });

  // mesh ask
  mesh
    .command('ask')
    .description('Ask LLM via mesh pool')
    .argument('<prompt>', 'Question or prompt')
    .option('-m, --model <name>', 'Model to use', 'gemma-4')
    .option('--max-tokens <number>', 'Max tokens', '2048')
    .option('-t, --temperature <number>', 'Temperature', '0.7')
    .option('-p, --priority <level>', 'Priority (low/normal/high)', 'normal')
    .action(async (prompt, options) => {
      if (!context.node || !context.pool) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      console.log(chalk.blue('🤖 Sending inference request to mesh...'));
      console.log(chalk.gray(`   Model: ${options.model}`));
      console.log(chalk.gray(`   Priority: ${options.priority}`));

      try {
        // In real implementation, get from auth
        const memberId = 'current-user';

        const result = await context.pool.submitInference(memberId, {
          model: options.model,
          prompt,
          maxTokens: parseInt(options.maxTokens),
          temperature: parseFloat(options.temperature),
          priority: options.priority as any,
        });

        console.log(chalk.green('\n✅ Response:\n'));
        console.log(result.content);
        console.log(chalk.gray(`\n---\nTokens: ${result.tokensGenerated} | Latency: ${result.latencyMs}ms | Verified: ${result.verified ? '✅' : '⏳'}`));

      } catch (error) {
        console.error(chalk.red('❌ Inference failed:'), error);
      }
    });

  // mesh consensus
  mesh
    .command('consensus')
    .description('Show consensus engine stats')
    .action(() => {
      if (!context.consensus) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      const stats = context.consensus.getStats();

      console.log(chalk.bold.blue('\n🛡️  Consensus Engine Stats\n'));
      console.log(`  Active Verifications: ${chalk.yellow(stats.activeRounds)}`);
      console.log(`  Completed: ${chalk.green(stats.completedRounds)}`);
      console.log(`  Verified: ${chalk.green(stats.verifiedCount)}`);
      console.log(`  Failed: ${chalk.red(stats.failedCount)}`);
      console.log(`  Avg Verifications/Result: ${chalk.cyan(stats.averageVerifications.toFixed(1))}`);
    });

  // mesh billing
  mesh
    .command('billing')
    .description('Show team billing summary')
    .action(() => {
      if (!context.billing) {
        console.log(chalk.yellow('⚠️  Not connected to mesh'));
        return;
      }

      const summary = context.billing.getTeamSummary();

      console.log(chalk.bold.blue('\n💰 Team Billing Summary\n'));
      console.log(`  Total Revenue: ${chalk.green(summary.totalRevenueSats.toLocaleString())} sats (${chalk.green('$' + summary.totalRevenueUsd.toFixed(2))})`);
      console.log(`  Invoices: ${chalk.yellow(summary.paidInvoices)}/${summary.totalInvoices} paid`);
      console.log(`  Pending: ${chalk.gray(summary.pendingInvoices)}`);
      console.log(`  Active Members: ${chalk.cyan(summary.memberCount)}`);
    });
}
