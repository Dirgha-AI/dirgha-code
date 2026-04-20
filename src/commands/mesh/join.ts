import chalk from 'chalk';
import { MeshNode, type MeshNodeConfig } from '../../mesh/MeshNode.js';
import { TeamResourcePool } from '../../mesh/TeamResourcePool.js';
import { LightningBilling } from '../../mesh/LightningBilling.js';
import { ConsensusEngine } from '../../mesh/ConsensusEngine.js';
import { setContext } from './context.js';
import { MeshJoinOptions } from './types.js';

export async function handleJoin(options: MeshJoinOptions): Promise<void> {
  console.log(chalk.blue('🌐 Joining mesh network...'));

  const config: MeshNodeConfig = {
    teamId: options.team,
    workspaceId: options.workspace,
    nodeId: '',
    maxCpuPercent: parseInt(options.cpu),
    maxMemoryGb: parseInt(options.memory),
    ollamaPort: 11434,
    listenPort: parseInt(options.port),
  };

  const node = new MeshNode(config);
  
  node.on('started', (data) => {
    console.log(chalk.green(`✅ Mesh node started: ${data.nodeId}`));
    console.log(chalk.gray(`   Team: ${options.team}`));
    console.log(chalk.gray(`   Workspace: ${options.workspace}`));
    console.log(chalk.gray(`   Resources: ${options.cpu}% CPU, ${options.memory}GB RAM`));
  });

  node.on('peer:discovered', (data) => {
    console.log(chalk.blue(`🔍 Discovered peer: ${data.peerId.slice(0, 16)}...`));
  });

  node.on('peer:connected', (data) => {
    console.log(chalk.green(`🔗 Connected to: ${data.peerId.slice(0, 16)}...`));
  });

  await node.start();

  const pool = new TeamResourcePool(options.team, options.workspace, node);
  const billing = new LightningBilling(options.team);
  const consensus = new ConsensusEngine();

  setContext({ node, pool, billing, consensus });

  console.log(chalk.green('\n✨ Mesh ready! Use "dirgha mesh status" to check pool'));
}
