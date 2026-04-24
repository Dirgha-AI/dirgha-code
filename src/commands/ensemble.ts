/**
 * /ensemble command — Multi-agent ensemble query
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getUnifiedAgentClient } from '../services/UnifiedAgentClient.js';

const AGENTS = ['coder', 'reviewer', 'architect', 'tester'];

export function registerEnsembleCommand(program: Command): void {
  program
    .command('ensemble <query>')
    .description('Multi-agent ensemble query (coder + reviewer + architect)')
    .option('-a, --agents <agents>', 'Agents to use (comma-separated)', 'coder,reviewer,architect')
    .option('-m, --mode <mode>', 'Mode: parallel|sequential|vote', 'parallel')
    .option('--detail', 'Show detailed agent responses')
    .action(async (query: string, options) => {
      const agents = options.agents.split(',').map((a: string) => a.trim());
      const validAgents = agents.filter((a: string) => AGENTS.includes(a));
      
      if (validAgents.length === 0) {
        console.log(chalk.red(`Invalid agents. Valid: ${AGENTS.join(', ')}`));
        return;
      }

      console.log(chalk.blue(`🎭 Ensemble: ${validAgents.join(' + ')}`));
      console.log(chalk.dim(`   Mode: ${options.mode}`));
      console.log();

      const client = getUnifiedAgentClient();
      const responses: Record<string, string> = {};

      // Run agents
      for (const agent of validAgents) {
        const spinner = spin(`Running ${agent}...`);
        
        const rolePrompt = getAgentPrompt(agent, query);
        const response = await client.execute({
          messages: [{ role: 'user', content: rolePrompt }],
          model: 'claude-haiku-4-5',
          ephemeral: true,
        });
        
        spinner.succeed(chalk.green(`${agent} done`));
        const content = response.message.content;
        responses[agent] = typeof content === 'string' ? content : 
          Array.isArray(content) ? (content as any[]).filter(b => b.type === 'text').map(b => b.text).join('') : '';
      }

      // Synthesize
      if (options.mode === 'vote') {
        console.log(chalk.bold('\n📊 Votes:'));
        for (const [agent, text] of Object.entries(responses)) {
          const vote = text.toLowerCase().includes('yes') ? chalk.green('✓ YES') : 
                      text.toLowerCase().includes('no') ? chalk.red('✗ NO') : chalk.yellow('?');
          console.log(`  ${chalk.cyan(agent)}: ${vote}`);
        }
      }

      // Synthesis
      console.log(chalk.bold('\n🎯 Synthesis:'));
      const synthesis = await client.execute({
        messages: [{
          role: 'user',
          content: `Synthesize these agent responses to: "${query}"\n\n${Object.entries(responses).map(([a, r]) => `---${a}---\n${r.slice(0, 500)}`).join('\n\n')}`
        }],
        model: 'claude-3-sonnet-20240229',
        ephemeral: true,
      });

      const synthContent = synthesis.message.content;
      console.log(chalk.white(typeof synthContent === 'string' ? synthContent : 
        Array.isArray(synthContent) ? (synthContent as any[]).filter(b => b.type === 'text').map(b => b.text).join('') : ''));

      if (options.detail) {
        console.log(chalk.dim('\n── Agent Details ──'));
        for (const [agent, text] of Object.entries(responses)) {
          console.log(chalk.cyan(`\n${agent}:`));
          console.log(chalk.dim(text.slice(0, 300) + (text.length > 300 ? '...' : '')));
        }
      }
    });
}

function getAgentPrompt(agent: string, query: string): string {
  const prompts: Record<string, string> = {
    coder: `You are a pragmatic coder. Provide working code solution for: ${query}`,
    reviewer: `You are a code reviewer. Find issues and suggest improvements for: ${query}`,
    architect: `You are a systems architect. Design approach for: ${query}`,
    tester: `You are a QA engineer. Test cases for: ${query}`,
  };
  return prompts[agent] || query;
}

function spin(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i])} ${text}`);
    i = (i + 1) % frames.length;
  }, 80);
  return {
    succeed: (msg: string) => { clearInterval(interval); console.log(`\r${chalk.green('✓')} ${msg}`); },
  };
}
