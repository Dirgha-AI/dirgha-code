import chalk from 'chalk';
import { getContext, resetContext } from './context.js';

export async function handleLeave(): Promise<void> {
  const ctx = getContext();
  
  if (!ctx.node) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  console.log(chalk.blue('👋 Leaving mesh network...'));
  await ctx.node.stop();
  resetContext();
  console.log(chalk.green('✅ Left mesh'));
}
