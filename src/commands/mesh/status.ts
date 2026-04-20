// @ts-nocheck
import chalk from 'chalk';
import Table from 'cli-table3';
import { getContext } from './context.js';

export function handleStatus(): void {
  const ctx = getContext();
  
  if (!ctx.node || !ctx.pool) {
    console.log(chalk.yellow('⚠️  Not connected to mesh. Run "dirgha mesh join" first'));
    return;
  }

  const resources = ctx.node.getAggregatedResources();
  const peers = ctx.node.getPeers();
  const metrics = ctx.pool.getMetrics();

  console.log(chalk.bold.blue('\n📊 Mesh Pool Status\n'));

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

  console.log(chalk.bold.blue('\n🖥️  Connected Peers\n'));
  
  const peerTable = new Table({
    head: [chalk.bold('Node ID'), chalk.bold('Cores'), chalk.bold('RAM'), chalk.bold('Status')],
    colWidths: [25, 10, 10, 15],
  });

  peerTable.push([
    chalk.green(ctx.node['config'].nodeId.slice(0, 20) + '... (you)'),
    'local',
    'local',
    chalk.green('online'),
  ]);

  peers.forEach(peer => {
    peerTable.push([
      peer.id.slice(0, 20) + '...',
      peer.resources.cpuCores.toString(),
      `${peer.resources.availableMemoryGb}GB`,
      peer.isOnline ? chalk.green('online') : chalk.gray('offline'),
    ]);
  });

  console.log(peerTable.toString());

  console.log(chalk.bold.blue('\n📈 Pool Metrics\n'));
  console.log(`  Nodes Online: ${chalk.green(metrics.onlineNodes)}/${metrics.totalNodes}`);
  console.log(`  Active Inferences: ${chalk.yellow(metrics.activeInferences)}`);
  console.log(`  Queue Depth: ${chalk.gray(metrics.queueDepth)}`);
  console.log(`  Avg Latency: ${chalk.cyan(metrics.avgLatencyMs)}ms`);
  console.log(`  Throughput: ${chalk.cyan(metrics.tokensPerSecond)} tok/sec`);
}
