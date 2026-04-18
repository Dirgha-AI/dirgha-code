/**
 * commands/models.ts — Model management CLI commands
 * 
 * Usage:
 *   dirgha models list              # List all available models
 *   dirgha models info <model>      # Show model details
 *   dirgha models switch <model>    # Set default model
 *   dirgha models recommend       # Get recommendation for task
 *   dirgha models health          # Check LiteLLM proxy health
 *   dirgha models pool add        # Add credential pool
 *   dirgha models pool status     # Check credential pool status
 */
import { ModelRegistry, createModelRouter } from '../models/index.js';
import { getCredentialPoolManager } from '../models/index.js';
import chalk from 'chalk';

export function registerModelCommands(program: any): void {
  const models = program.command('models').description('Manage AI models and providers');

  // List models
  models
    .command('list')
    .description('List all available models')
    .option('-p, --provider <provider>', 'Filter by provider')
    .option('-t, --tag <tag>', 'Filter by tag (e.g., free, fast, vision)')
    .action(async (opts: { provider?: string; tag?: string }) => {
      let models = ModelRegistry.getModelsByTag('recommended');

      if (opts.provider) {
        models = ModelRegistry.getModelsByProvider(opts.provider);
      } else if (opts.tag) {
        models = ModelRegistry.getModelsByTag(opts.tag);
      }

      console.log(chalk.bold('\n📦 Available Models\n'));

      const byProvider = models.reduce((acc, m) => {
        acc[m.provider] = acc[m.provider] || [];
        acc[m.provider].push(m);
        return acc;
      }, {} as Record<string, typeof models>);

      for (const [provider, ms] of Object.entries(byProvider)) {
        console.log(chalk.cyan(`${provider.toUpperCase()}`));
        for (const m of ms.slice(0, 5)) {
          const price = m.pricing.inputPer1k === 0 
            ? chalk.green('FREE') 
            : `$${m.pricing.inputPer1k}/1K`;
          console.log(`  ${chalk.bold(m.id.padEnd(25))} ${m.name.padEnd(20)} ${price}`);
        }
        if (ms.length > 5) {
          console.log(`  ... and ${ms.length - 5} more`);
        }
        console.log();
      }

      console.log(chalk.dim('Use `dirgha models info <id>` for details\n'));
    });

  // Model info
  models
    .command('info <model>')
    .description('Show detailed model information')
    .action((modelId: string) => {
      const model = ModelRegistry.getModel(modelId);
      if (!model) {
        console.log(chalk.red(`Model '${modelId}' not found`));
        console.log(chalk.dim('Run `dirgha models list` to see available models'));
        return;
      }

      console.log(chalk.bold(`\n📊 ${model.name}\n`));
      console.log(`ID:          ${chalk.cyan(model.id)}`);
      console.log(`Provider:    ${chalk.yellow(model.provider)}`);
      console.log(`Description: ${model.description}`);
      console.log(`Tags:        ${model.tags.map(t => chalk.green(t)).join(', ')}`);

      console.log(chalk.bold('\n💰 Pricing'));
      console.log(`  Input:  $${model.pricing.inputPer1k}/1K tokens`);
      console.log(`  Output: $${model.pricing.outputPer1k}/1K tokens`);

      console.log(chalk.bold('\n⚡ Capabilities'));
      console.log(`  Vision:          ${model.capabilities.vision ? '✅' : '❌'}`);
      console.log(`  Function Calling: ${model.capabilities.functionCalling ? '✅' : '❌'}`);
      console.log(`  Reasoning:       ${model.capabilities.reasoning ? '✅' : '❌'}`);
      console.log(`  Streaming:       ${model.capabilities.streaming ? '✅' : '❌'}`);
      console.log(`  Context Window:  ${model.capabilities.contextWindow.toLocaleString()} tokens`);
      console.log(`  Max Output:      ${model.capabilities.maxTokens.toLocaleString()} tokens`);

      if (model.fallback?.length) {
        console.log(chalk.bold('\n🔄 Fallback Chain'));
        model.fallback.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      }

      console.log();
    });

  // Switch default model
  models
    .command('switch <model>')
    .description('Set default model for CLI sessions')
    .action((modelId: string) => {
      const model = ModelRegistry.getModel(modelId);
      if (!model) {
        console.log(chalk.red(`Unknown model: ${modelId}`));
        return;
      }

      // Update environment for current session
      process.env['DIRGHA_CODE_MODEL'] = modelId;
      
      console.log(chalk.green(`✅ Default model set to ${chalk.bold(model.name)}`));
      console.log(chalk.dim(`   Provider: ${model.provider}`));
      console.log(chalk.dim(`   Pricing:  $${model.pricing.inputPer1k}/1K input, $${model.pricing.outputPer1k}/1K output`));
    });

  // Recommend model for task
  models
    .command('recommend [task]')
    .description('Get model recommendation for a task')
    .action((task: string = 'balanced') => {
      const taskMap: Record<string, string> = {
        coding: 'coding',
        code: 'coding',
        reasoning: 'reasoning',
        complex: 'reasoning',
        vision: 'vision',
        image: 'vision',
        fast: 'fast',
        quick: 'fast',
        cheap: 'cheap',
        free: 'cheap',
      };

      const mapped = taskMap[task.toLowerCase()] || 'balanced';
      const modelId = ModelRegistry.getRecommendedModel(mapped as any);
      const model = ModelRegistry.getModel(modelId)!;

      console.log(chalk.bold(`\n🎯 Recommendation for '${task}'\n`));
      console.log(`Model: ${chalk.bold(model.name)} (${modelId})`);
      console.log(`Why:   ${model.description}`);
      console.log(`Price: $${model.pricing.inputPer1k}/1K input`);
      console.log(chalk.dim(`\nUse: dirgha models switch ${modelId}`));
    });

  // Health check
  models
    .command('health')
    .description('Check LiteLLM proxy health and available models')
    .action(async () => {
      const router = createModelRouter();
      
      console.log(chalk.bold('\n🏥 LiteLLM Health Check\n'));
      
      try {
        const health = await router.healthCheck();
        
        if (health.healthy) {
          console.log(`${chalk.green('✅')} Proxy:     ${chalk.green('Healthy')}`);
          console.log(`${chalk.green('✅')} Models:    ${health.models} models available`);
          console.log(`${chalk.green('✅')} Latency:   ${health.latency}ms`);
        } else {
          console.log(`${chalk.red('❌')} Proxy:     ${chalk.red('Unhealthy')}`);
          console.log(chalk.yellow('   Is LiteLLM running? Run: pm2 logs dirgha-litellm'));
        }
      } catch (err) {
        console.log(`${chalk.red('❌')} Error: ${(err as Error).message}`);
      }
      console.log();
    });

  // Credential pool commands
  const pool = models.command('pool').description('Manage credential pools');

  pool
    .command('add <provider> <keys...>')
    .description('Add credential pool for a provider')
    .option('-s, --strategy <strategy>', 'Rotation strategy: least_used, round_robin, failover', 'least_used')
    .action((provider: string, keys: string[], opts: { strategy: string }) => {
      const manager = getCredentialPoolManager();
      
      manager.addPool(provider, keys, opts.strategy as any);
      
      console.log(chalk.green(`✅ Added ${keys.length} keys for ${provider}`));
      console.log(chalk.dim(`   Strategy: ${opts.strategy}`));
    });

  pool
    .command('status [provider]')
    .description('Check credential pool status')
    .action((provider?: string) => {
      const manager = getCredentialPoolManager();

      if (provider) {
        const stats = manager.getStats(provider);
        if (!stats) {
          console.log(chalk.yellow(`No pool configured for ${provider}`));
          return;
        }
        console.log(chalk.bold(`\n🔐 ${provider} Pool\n`));
        console.log(`Total:   ${stats.total} keys`);
        console.log(`Healthy: ${chalk.green(stats.healthy.toString())}`);
        console.log(`Usage:   ${stats.totalUsage} total calls`);
      } else {
        const pools = manager.listPools();
        if (pools.length === 0) {
          console.log(chalk.yellow('No credential pools configured'));
          return;
        }
        
        console.log(chalk.bold('\n🔐 Credential Pools\n'));
        for (const p of pools) {
          const stats = manager.getStats(p);
          const status = stats && stats.healthy > 0 ? chalk.green('✅') : chalk.red('❌');
          console.log(`${status} ${p.padEnd(15)} ${stats?.healthy || 0}/${stats?.total || 0} keys`);
        }
      }
      console.log();
    });
}
