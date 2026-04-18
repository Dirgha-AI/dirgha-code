// @ts-nocheck
/**
 * commands/scan.ts — Security scan command
 * Multi-engine security scanner for skills, code, and dependencies (OSV)
 * Pattern-based detection
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile, scanDirectory, generateReport, type ScanResult } from '../security/index.js';
import type { ScanOptions } from '../security/types.js';
// Stubs for unavailable packages/core modules
class ArnikoClient { constructor(_opts: any) {} async startScan(_opts: any) { return { id: '' }; } async getScanResult(_id: string) { return { status: 'done', findings: [] }; } }

async function getDepScanner() {
  return { scanDirectory: async (_d: string) => ({ scanned: 0, reports: [] }), checkSupplyChainRisks: async (_d: string) => ({ risks: [] }) };
}

export const scanCommand = new Command('scan')
  .description('Security scan for skills, code, and dependencies')
  .argument('[path]', 'File or directory to scan', '.')
  .option('-r, --recursive', 'Scan directories recursively', false)
  .option('--deps', 'Scan package-lock.json/yarn.lock/pnpm-lock.yaml for CVEs via OSV', false)
  .option('--supply-chain', 'Check node_modules for suspicious install scripts', false)
  .option('--dir <path>', 'Directory to scan (used with --deps / --supply-chain)', '')
  .option('--no-prompt-injection', 'Disable prompt injection checks')
  .option('--no-data-exfiltration', 'Disable data exfiltration checks')
  .option('--no-command-injection', 'Disable command injection checks')
  .option('--no-malicious-code', 'Disable malicious code checks')
  .option('--no-supply-chain-code', 'Disable supply chain code checks')
  .option('--no-secrets', 'Disable secrets detection')
  .option('--fail-on-severity <level>', 'Fail on severity (critical|high|medium|low)', 'high')
  .option('--use-llm', 'Enable LLM semantic analysis', false)
  .option('--format <format>', 'Output format (table|json|markdown|sarif)', 'table')
  .option('-o, --output <file>', 'Output file')
  .action(async (path, options) => {
    // ── OSV dependency scan mode ──────────────────────────────────────────
    if (options.deps || options.supplyChain) {
      await runDepScan({
        deps: !!options.deps,
        supplyChain: !!options.supplyChain,
        dir: options.dir || process.cwd(),
      });
      return;
    }
    const scanOptions: ScanOptions = {
      checkPromptInjection: options.promptInjection,
      checkDataExfiltration: options.dataExfiltration,
      checkCommandInjection: options.commandInjection,
      checkMaliciousCode: options.maliciousCode,
      checkSupplyChain: options.supplyChain,
      checkSecrets: options.secrets,
      failOnSeverity: options.failOnSeverity,
      useLLM: options.useLlm,
    };

    console.log(chalk.cyan('🔒 Security Scan'));
    console.log(chalk.gray(`Target: ${path}`));
    console.log();

    try {
      const arnikoUrl = process.env.ARNIKO_URL;
      if (arnikoUrl) {
        console.log(chalk.blue('Using Arniko Security Substrate...'));
        const client = new ArnikoClient({ baseUrl: arnikoUrl, apiKey: process.env.ARNIKO_API_KEY });
        const scanId = await client.startScan({
          targetId: path,
          targetType: 'repository',
          tools: ['semgrep', 'bandit', 'gitleaks', 'trivy'] // Subset of default tools
        });
        console.log(chalk.gray(`Started Arniko Scan ID: ${scanId}`));
        const results = await client.waitForCompletion(scanId);
        
        console.log(chalk.bold('Arniko Summary:'));
        console.log(`  Total findings: ${results.count}`);
        for (const finding of results.findings) {
          console.log(`  [${finding.severity.toUpperCase()}] ${finding.tool}: ${finding.message}`);
        }
        
        if (results.findings.some(f => f.severity === 'critical' || f.severity === 'high')) {
          console.log(chalk.red(`❌ Scan failed: Found high/critical issues`));
          process.exit(1);
        } else {
          console.log(chalk.green('✅ Scan complete: No critical security issues found'));
          process.exit(0);
        }
      }

      const stat = await import('node:fs').then(fs => fs.statSync(path));

      
      let results: ScanResult[];
      if (stat.isDirectory()) {
        results = await scanDirectory(path, scanOptions);
      } else {
        results = [await scanFile(path, scanOptions)];
      }

      // Output results
      switch (options.format) {
        case 'json':
          await outputJson(results, options.output);
          break;
        case 'markdown':
          await outputMarkdown(results, options.output);
          break;
        case 'sarif':
          await outputSarif(results, options.output);
          break;
        default:
          outputTable(results);
      }

      // Exit with error if findings above threshold
      const summary = generateReport(results);
      const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
      const thresholdIndex = severityOrder.indexOf(options.failOnSeverity);
      
      const hasCritical = summary.criticalCount > 0;
      const hasHigh = summary.highCount > 0 && thresholdIndex <= severityOrder.indexOf('high');
      const hasMedium = summary.mediumCount > 0 && thresholdIndex <= severityOrder.indexOf('medium');
      
      if (hasCritical || hasHigh || hasMedium) {
        console.log();
        console.log(chalk.red(`❌ Scan failed: Found ${summary.totalFindings} security issues`));
        process.exit(1);
      }

      console.log();
      console.log(chalk.green('✅ Scan complete: No security issues found'));

    } catch (error) {
      console.error(chalk.red(`❌ Scan failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

function outputTable(results: ScanResult[]) {
  const summary = generateReport(results);
  
  console.log(chalk.bold('Summary:'));
  console.log(`  Files scanned: ${summary.totalFiles}`);
  console.log(`  Total findings: ${summary.totalFindings}`);
  
  if (summary.criticalCount > 0) console.log(chalk.red(`  Critical: ${summary.criticalCount}`));
  if (summary.highCount > 0) console.log(chalk.red(`  High: ${summary.highCount}`));
  if (summary.mediumCount > 0) console.log(chalk.yellow(`  Medium: ${summary.mediumCount}`));
  if (summary.lowCount > 0) console.log(chalk.blue(`  Low: ${summary.lowCount}`));
  if (summary.infoCount > 0) console.log(chalk.gray(`  Info: ${summary.infoCount}`));
  
  console.log();
  
  for (const result of results) {
    if (result.findings.length === 0) continue;
    
    console.log(chalk.bold(`\n${result.file}`));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const finding of result.findings) {
      const severityColor = {
        critical: chalk.bgRed.white,
        high: chalk.red,
        medium: chalk.yellow,
        low: chalk.blue,
        info: chalk.gray,
      }[finding.severity];
      
      console.log(`  ${severityColor(`[${finding.severity.toUpperCase()}]`)} ${finding.ruleName}`);
      console.log(`  Line ${finding.line}:${finding.column} - ${finding.message}`);
      if (finding.code) {
        console.log(chalk.gray(`  Code: ${finding.code.substring(0, 60)}`));
      }
      console.log(chalk.cyan(`  Fix: ${finding.remediation}`));
      console.log();
    }
  }
}

async function outputJson(results: ScanResult[], outputFile?: string) {
  const json = JSON.stringify(results, null, 2);
  if (outputFile) {
    await import('node:fs').then(fs => fs.writeFileSync(outputFile, json));
    console.log(`JSON report written to ${outputFile}`);
  } else {
    console.log(json);
  }
}

async function outputMarkdown(results: ScanResult[], outputFile?: string) {
  const summary = generateReport(results);
  
  let md = `# Security Scan Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  
  md += `## Summary\n\n`;
  md += `- **Files scanned:** ${summary.totalFiles}\n`;
  md += `- **Total findings:** ${summary.totalFindings}\n`;
  md += `- **Critical:** ${summary.criticalCount}\n`;
  md += `- **High:** ${summary.highCount}\n`;
  md += `- **Medium:** ${summary.mediumCount}\n`;
  md += `- **Low:** ${summary.lowCount}\n`;
  md += `- **Info:** ${summary.infoCount}\n\n`;
  
  for (const result of results) {
    if (result.findings.length === 0) continue;
    
    md += `## ${result.file}\n\n`;
    
    for (const finding of result.findings) {
      md += `### ${finding.ruleName} (${finding.severity.toUpperCase()})\n\n`;
      md += `- **Location:** Line ${finding.line}, Column ${finding.column}\n`;
      md += `- **Category:** ${finding.category}\n`;
      md += `- **Message:** ${finding.message}\n`;
      if (finding.code) {
        md += `- **Code:** \`\`\`${finding.code}\`\`\`\n`;
      }
      md += `- **Remediation:** ${finding.remediation}\n\n`;
    }
  }
  
  if (outputFile) {
    await import('node:fs').then(fs => fs.writeFileSync(outputFile, md));
    console.log(`Markdown report written to ${outputFile}`);
  } else {
    console.log(md);
  }
}

async function outputSarif(results: ScanResult[], outputFile?: string) {
  // SARIF format for GitHub Code Scanning
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'dirgha-security-scanner',
          version: '0.2.0',
          informationUri: 'https://github.com/dirgha-ai/cli',
          rules: generateSarifRules(),
        },
      },
      results: results.flatMap(r => 
        r.findings.map(f => ({
          ruleId: f.ruleId,
          level: sarifLevel(f.severity),
          message: { text: f.message },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: r.file },
              region: {
                startLine: f.line,
                startColumn: f.column,
              },
            },
          }],
        }))
      ),
    }],
  };
  
  const json = JSON.stringify(sarif, null, 2);
  if (outputFile) {
    await import('node:fs').then(fs => fs.writeFileSync(outputFile, json));
    console.log(`SARIF report written to ${outputFile}`);
  } else {
    console.log(json);
  }
}

function generateSarifRules() {
  const { SECURITY_RULES } = require('../security/rules.js');
  return SECURITY_RULES.map(r => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.description },
    fullDescription: { text: r.description },
    defaultConfiguration: { level: sarifLevel(r.severity) },
  }));
}

function sarifLevel(severity: string): string {
  const map: Record<string, string> = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
    info: 'none',
  };
  return map[severity] || 'warning';
}

// ── OSV dependency scan ───────────────────────────────────────────────────────

async function runDepScan(opts: { deps: boolean; supplyChain: boolean; dir: string }): Promise<void> {
  const { scanDirectory: osvScanDir, checkSupplyChainRisks } = await getDepScanner();
  const targetDir = opts.dir;

  let exitCode = 0;

  if (opts.deps) {
    console.log(chalk.cyan(`Scanning dependencies in ${targetDir}...`));
    const result = await osvScanDir(targetDir);

    if (result.scanned === 0) {
      console.log(chalk.yellow('No lockfile found (package-lock.json / yarn.lock / pnpm-lock.yaml)'));
    } else {
      console.log(`Checked ${result.scanned} packages against OSV database`);

      if (result.reports.length === 0) {
        console.log(chalk.green(`✓ No vulnerabilities found in ${result.scanned} packages`));
      } else {
        for (const report of result.reports) {
          for (const vuln of report.vulns) {
            const sev = vuln.severity;
            const color =
              sev === 'CRITICAL' ? chalk.red :
              sev === 'HIGH'     ? chalk.red :
              sev === 'MEDIUM'   ? chalk.yellow :
                                   chalk.blue;
            const fix = vuln.fixedIn ? ` (fix: ${vuln.fixedIn})` : '';
            console.log(color(`⚠ ${report.package}@${report.version} — ${sev}: ${vuln.summary}${fix}`));
          }
        }
        console.log();
        console.log(
          chalk.red(
            `Found ${result.reports.reduce((n, r) => n + r.vulns.length, 0)} vulnerabilities` +
            ` (${result.critical} critical, ${result.high} high)` +
            ` in ${result.vulnerable} packages`
          )
        );
        if (result.critical > 0) exitCode = 1;
      }

      console.log(chalk.dim(`Scan completed in ${result.scanTimeMs}ms`));
    }
  }

  if (opts.supplyChain) {
    const nmPath = `${targetDir}/node_modules`;
    console.log(chalk.cyan(`\nChecking supply chain risks in ${nmPath}...`));
    const risks = await checkSupplyChainRisks(nmPath);

    if (risks.length === 0) {
      console.log(chalk.green('✓ No install scripts detected'));
    } else {
      const parts = risks.map(r => `${r.package} (${r.severity})`).join(', ');
      console.log(chalk.yellow(`⚡ Install scripts found: ${parts}`));
      for (const risk of risks) {
        const color = risk.severity === 'HIGH' ? chalk.red : chalk.yellow;
        console.log(color(`  ${risk.package} [${risk.riskType}]: ${risk.script.slice(0, 120)}`));
      }
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
}
