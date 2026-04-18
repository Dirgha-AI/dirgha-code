
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile, scanDirectory, generateReport } from '../../security/index.js';
import type { ScanOptions } from '../../security/types.js';
import { ScanCommandOptions } from './types.js';
import { outputTable } from './output.js';
import { outputJson, outputMarkdown, outputSarif } from './utils.js';
import { runArnikoScan } from './arniko.js';
import { runDepScan } from './deps.js';

// Stub dep scanner (packages/core not available in standalone CLI)
async function getDepScanner() {
  return { scanDirectory: async (_d: string) => ({ scanned: 0, reports: [] }), checkSupplyChainRisks: async (_d: string) => ({ risks: [] }) };
}

export const scanCommand = new Command('scan')
  .description('Security scan for skills, code, and dependencies')
  .argument('[path]', 'File or directory to scan', '.')
  .option('-r, --recursive', 'Scan directories recursively', false)
  .option('--deps', 'Scan package-lock.json/yarn.lock/pnpm-lock.yaml for CVEs via OSV', false)
  .option('--supply-chain', 'Check node_modules for suspicious install scripts', false)
  .option('--dir <path>', 'Directory to scan', '')
  .option('--no-prompt-injection', 'Disable prompt injection checks')
  .option('--no-data-exfiltration', 'Disable data exfiltration checks')
  .option('--no-command-injection', 'Disable command injection checks')
  .option('--no-malicious-code', 'Disable malicious code checks')
  .option('--no-supply-chain-code', 'Disable supply chain code checks')
  .option('--no-secrets', 'Disable secrets detection')
  .option('--fail-on-severity <level>', 'Fail on severity', 'high')
  .option('--use-llm', 'Enable LLM semantic analysis', false)
  .option('--format <format>', 'Output format (table|json|markdown|sarif)', 'table')
  .option('-o, --output <file>', 'Output file')
  .action(async (path: string, options: ScanCommandOptions) => {
    // OSV dependency scan mode
    if (options.deps || options.supplyChain) {
      const exitCode = await runDepScan({
        deps: !!options.deps,
        supplyChain: !!options.supplyChain,
        dir: options.dir || process.cwd(),
      });
      process.exit(exitCode);
    }

    const scanOptions: ScanOptions = {
      checkPromptInjection: options.promptInjection,
      checkDataExfiltration: options.dataExfiltration,
      checkCommandInjection: options.commandInjection,
      checkMaliciousCode: options.maliciousCode,
      checkSupplyChain: options.supplyChain,
      checkSecrets: options.secrets,
      failOnSeverity: options.failOnSeverity as import('../../security/types.js').Severity | undefined,
      useLLM: options.useLlm,
    };

    console.log(chalk.cyan('🔒 Security Scan'));
    console.log(chalk.gray(`Target: ${path}`));
    console.log();

    try {
      // Try Arniko first
      const hasArnikoErrors = await runArnikoScan(path);
      if (hasArnikoErrors) {
        process.exit(1);
      }

      const stat = await import('node:fs').then(fs => fs.statSync(path));
      let results = stat.isDirectory() 
        ? await scanDirectory(path, scanOptions)
        : [await scanFile(path, scanOptions)];

      // Output results
      switch (options.format) {
        case 'json': await outputJson(results, options.output); break;
        case 'markdown': await outputMarkdown(results, options.output); break;
        case 'sarif': await outputSarif(results, options.output); break;
        default: outputTable(results);
      }

      // Check severity threshold
      const summary = generateReport(results);
      const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
      const thresholdIndex = severityOrder.indexOf(options.failOnSeverity);
      
      const hasHigh = summary.highCount > 0 && thresholdIndex <= severityOrder.indexOf('high');
      const hasMedium = summary.mediumCount > 0 && thresholdIndex <= severityOrder.indexOf('medium');
      
      if (summary.criticalCount > 0 || hasHigh || hasMedium) {
        console.log(chalk.red(`\n❌ Scan failed: Found ${summary.totalFindings} security issues`));
        process.exit(1);
      }

      console.log(chalk.green('\n✅ Scan complete: No security issues found'));

    } catch (error) {
      console.error(chalk.red(`❌ Scan failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

export * from './types.js';
export * from './utils.js';
export * from './output.js';
export * from './arniko.js';
export * from './deps.js';
