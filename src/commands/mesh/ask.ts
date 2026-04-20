// @ts-nocheck
import chalk from 'chalk';
import { getContext } from './context.js';
import { MeshAskOptions } from './types.js';

export async function handleAsk(prompt: string, options: MeshAskOptions): Promise<void> {
  const ctx = getContext();
  
  if (!ctx.node || !ctx.pool) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  console.log(chalk.blue('🤖 Sending inference request to mesh...'));
  console.log(chalk.gray(`   Model: ${options.model}`));
  console.log(chalk.gray(`   Priority: ${options.priority}`));

  let MeshLLMAdapter: any;
  try {
    const mod = await import('@dirgha/bucky/mesh-llm');
    MeshLLMAdapter = mod.MeshLLMAdapter;
  } catch {
    console.error(chalk.red('✗ Mesh LLM requires @dirgha/bucky to be installed'));
    return;
  }

  try {
    // Use MeshLLMAdapter for distributed inference
    const adapter = new MeshLLMAdapter({
      buckyNode: ctx.node,
      consensus: ctx.consensus,
      lightning: ctx.lightning,
      config: {
        routingStrategy: options.strategy || 'least-loaded',
        fallbackToLocal: true,
        defaultVerificationPeers: parseInt(options.verifiers || '3')
      }
    });

    const result = await adapter.routeInference({
      id: `job-${Date.now()}`,
      model: options.model,
      prompt,
      maxTokens: parseInt(options.maxTokens),
      temperature: parseFloat(options.temperature),
      priority: options.priority as any,
      userId: ctx.userId || 'anonymous',
      requireVerification: options.verify !== 'false'
    });

    console.log(chalk.green('\n✅ Response:\n'));
    console.log(result.content);
    console.log(chalk.gray(
      `\n---\n` +
      `Tokens: ${result.tokensGenerated} | ` +
      `Latency: ${result.latencyMs}ms | ` +
      `Speed: ${result.tokensPerSecond.toFixed(1)} tok/s | ` +
      `Verified: ${result.verified ? '✅' : '⏳'} | ` +
      `Cost: ${result.cost} sats`
    ));

    if (result.verifications.length > 0) {
      console.log(chalk.gray(`Verifiers: ${result.verifications.length} peers`));
    }

  } catch (error) {
    console.error(chalk.red('❌ Inference failed:'), error);
  }
}
