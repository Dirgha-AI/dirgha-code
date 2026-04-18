// @ts-nocheck
/**
 * llm/ensemble.ts — MoA CLI integration
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { runEnsemble } from '../agents/ensemble.js';
import type { Agent, EnsembleConfig, Task } from '../agents/types.js';

const DEFAULT_ENSEMBLE: EnsembleConfig = {
  layer1: [
    { id: 'architect', name: 'Architect', role: 'architect', model: 'claude-3-sonnet', systemPrompt: 'Design patterns' },
    { id: 'coder', name: 'Coder', role: 'coder', model: 'claude-3-sonnet', systemPrompt: 'Implementation' },
    { id: 'tester', name: 'Tester', role: 'tester', model: 'claude-3-sonnet', systemPrompt: 'Quality assurance' },
    { id: 'reviewer', name: 'Reviewer', role: 'reviewer', model: 'claude-3-sonnet', systemPrompt: 'Code review' }
  ],
  layer2: { id: 'lead', name: 'Lead', role: 'architect', model: 'claude-3-opus', systemPrompt: 'Synthesis' },
  useFor: 'complex',
  confidenceThreshold: 0.7
};

export function registerEnsembleCommand(program: Command): void {
  program
    .command('ensemble <task>')
    .description('Run MoA ensemble for complex tasks')
    .option('-t, --type <type>', 'Ensemble type: complex|critical|planning', 'complex')
    .action(async (task: string, options: { type?: string }) => {
      console.log(chalk.blue('Starting ensemble...'));
      console.log(chalk.dim(`  Task: ${task}`));
      console.log(chalk.dim(`  Agents: ${DEFAULT_ENSEMBLE.layer1.length}`));
      
      const taskObj: Task = {
        id: `task-${Date.now()}`,
        description: task,
        context: '',
        deliverables: ['decision', 'reasoning']
      };
      
      const result = await runEnsemble(DEFAULT_ENSEMBLE, taskObj);
      
      console.log(chalk.green(`\n✓ Ensemble complete`));
      console.log(chalk.dim(`  Consensus: ${(result.consensus * 100).toFixed(0)}%`));
      console.log(chalk.dim(`  Decision: ${result.decision ? 'APPROVE' : 'REJECT'}`));
      console.log(chalk.dim(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`));
      
      for (const d of result.layer1Decisions) {
        const icon = d.approve ? chalk.green('✓') : chalk.red('✗');
        console.log(chalk.dim(`  ${icon} ${d.agentId}: ${d.reasoning}`));
      }
    });
}
