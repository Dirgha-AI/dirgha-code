/**
 * commands/research.ts — Deep Research command
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { DeepResearcher } from '../agent/orchestration/researcher.js';

export const researchCommand = new Command('research')
  .description('Perform deep agentic research on a topic')
  .argument('<topic>', 'Topic to investigate')
  .option('-d, --depth <number>', 'Research depth (1-3)', '2')
  .action(async (topic, options) => {
    console.log(chalk.bold.hex('#6366f1')(`\n🔎 Deep Research initiated: "${topic}"`));
    
    try {
      const researcher = new DeepResearcher();
      const report = await researcher.performResearch(topic, parseInt(options.depth));
      
      console.log(chalk.green(`\n✅ Research Complete\n`));
      console.log(chalk.bold.white(`Topic: ${report.topic}`));
      console.log(chalk.dim(`\nSummary:`));
      console.log(report.summary);
      
      console.log(chalk.bold.hex('#6366f1')(`\n📊 Key Findings:`));
      report.findings.forEach((f, i) => {
        const color = f.confidence > 0.8 ? chalk.green : f.confidence > 0.5 ? chalk.yellow : chalk.red;
        console.log(`\n${i + 1}. [${color((f.confidence * 100).toFixed(0) + '%')}] ${f.claim}`);
        console.log(chalk.dim(`   Evidence: ${f.evidence}`));
        console.log(chalk.dim(`   Source: ${f.source}`));
      });
      
      console.log(chalk.bold.hex('#6366f1')(`\n🔗 Citations:`));
      report.citations.forEach(c => console.log(chalk.dim(`- ${c}`)));
      
      if (report.unresolved_questions.length > 0) {
        console.log(chalk.bold.yellow(`\n❓ Unresolved Questions:`));
        report.unresolved_questions.forEach(q => console.log(chalk.dim(`- ${q}`)));
      }
      
      console.log('\n');
    } catch (err: any) {
      console.error(chalk.red(`\n❌ Research failed: ${err.message}`));
      process.exit(1);
    }
  });
