/**
 * commands/audit.ts — Dirgha Verifier CLI Command
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getUnifiedAgentClient } from '../services/UnifiedAgentClient.js';

export const auditCommand = new Command('audit')
  .description('Reproduce and verify technical claims from an ArXiv paper')
  .argument('<arxiv-id>', 'The ArXiv ID to audit (e.g., 2401.12345)')
  .action(async (arxivId) => {
    const client = getUnifiedAgentClient();
    const spinner = ora(chalk.hex('#6366f1')(`[Verifier] Ingesting paper ${arxivId}...`)).start();

    try {
      // 1. Trigger Ingestion via Gateway
      const ingestRes = await client.request('POST', '/verifier/ingest', { arxivId });
      
      if (!ingestRes.success) {
        spinner.fail(chalk.red(`Ingest failed: ${ingestRes.error}`));
        return;
      }

      const { metadata, key, repoUrl } = ingestRes.data;
      spinner.succeed(chalk.green(`Paper Ingested: "${metadata.title}"`));
      console.log(chalk.dim(`Stored in R2: ${key}`));

      if (repoUrl) {
        console.log(chalk.green(`✔ Detected Repository: ${repoUrl}`));
      } else {
        console.log(chalk.yellow(`⚠ No repository URL detected in paper metadata or PDF.`));
      }

      // 2. Start Simulation/Audit (Sprint 2 Logic)
      const forgeSpinner = ora(chalk.hex('#6366f1')(`[Verifier] Initializing Forge (E2B Sandbox)...`)).start();
      
      const provisionRes = await client.request('POST', '/verifier/provision', { arxivId, repoUrl });
      
      if (!provisionRes.success) {
        forgeSpinner.fail(chalk.red(`Provisioning failed: ${provisionRes.error}`));
        console.log(chalk.dim(`You can try again with a manual repo URL using 'dirgha audit <id> --repo <url>' (coming soon)`));
        return;
      }

      const { result } = provisionRes.data;
      forgeSpinner.succeed(chalk.green(`Forge Ready: Sandbox ${result.sandboxId}`));
      
      console.log(chalk.bold.white(`\nEnvironment Details:`));
      console.log(`- Sandbox ID: ${chalk.cyan(result.sandboxId)}`);
      console.log(`- Tech Stack: ${chalk.yellow(result.techStack.join(', ') || 'Unknown')}`);
      
      if (result.installOutput) {
        console.log(chalk.dim(`\nInstall Output (Last 5 lines):`));
        const lines = result.installOutput.split('\n');
        lines.slice(-5).forEach((l: string) => console.log(chalk.dim(`  ${l}`)));
      }

      console.log(chalk.bold.green(`\n✅ Sprint 2 Complete: Environment is forged and dependencies are installed.`));

      // 3. Start Alchemist (Sprint 3 Logic)
      const alchemistSpinner = ora(chalk.hex('#6366f1')(`[Verifier] Running Alchemist Verification (Tests)...`)).start();
      
      const verifyRes = await client.request('POST', '/verifier/verify', { arxivId });
      
      if (!verifyRes.success) {
        alchemistSpinner.fail(chalk.red(`Verification failed: ${verifyRes.error}`));
        return;
      }

      const { result: testResult } = verifyRes.data;
      if (testResult.passed) {
        alchemistSpinner.succeed(chalk.green(`Verification PASSED: Code reproduces claims.`));
      } else {
        alchemistSpinner.fail(chalk.red(`Verification FAILED: Code execution failed or tests did not pass.`));
      }

      console.log(chalk.bold.white(`\nTest Summary:`));
      console.log(`- Command: ${chalk.cyan(testResult.testCommand)}`);
      if (testResult.totalTests > 0) {
        console.log(`- Results: ${chalk.green(testResult.passedTests + ' passed')}, ${chalk.red(testResult.failedTests + ' failed')} / ${testResult.totalTests} total`);
      }
      
      console.log(chalk.dim(`\nTest Output (Last 10 lines):`));
      const testLines = testResult.output.split('\n');
      testLines.slice(-10).forEach((l: string) => console.log(chalk.dim(`  ${l}`)));

      console.log(chalk.bold.hex('#6366f1')(`\n🎉 Dirgha Verifier Audit Complete for ${arxivId}`));
      console.log(chalk.dim(`Full logs and artifacts stored in your R2 isolated storage.`));

    } catch (err: any) {
      spinner.fail(chalk.red(`Audit error: ${err.message}`));
    }
  });
