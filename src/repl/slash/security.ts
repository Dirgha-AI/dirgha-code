/**
 * repl/slash/security.ts — Security slash commands
 */
import chalk from 'chalk';
import type { SlashCommand, ReplContext } from './types.js';
import { scanFile, scanDirectory, generateReport } from '../../security/index.js';

export const securityCommands: SlashCommand[] = [
  {
    name: '/scan',
    description: 'Security scan file or directory',
    category: 'security',
    handler: async (args: string, ctx: ReplContext) => {
      const path = args.trim() || '.';
      
      console.log(chalk.cyan('🔒 Running security scan...'));
      
      try {
        const stat = await import('node:fs').then(fs => fs.statSync(path));
        
        let results;
        if (stat.isDirectory()) {
          results = await scanDirectory(path);
        } else {
          results = [await scanFile(path)];
        }
        
        const summary = generateReport(results);
        
        // Quick summary for REPL
        if (summary.totalFindings === 0) {
          console.log(chalk.green('✅ No security issues found'));
          return;
        }
        
        console.log(chalk.yellow(`⚠️ Found ${summary.totalFindings} security issues:`));
        if (summary.criticalCount) console.log(chalk.red(`  Critical: ${summary.criticalCount}`));
        if (summary.highCount) console.log(chalk.red(`  High: ${summary.highCount}`));
        if (summary.mediumCount) console.log(chalk.yellow(`  Medium: ${summary.mediumCount}`));
        if (summary.lowCount) console.log(chalk.blue(`  Low: ${summary.lowCount}`));
        
        // Show first few findings
        const allFindings = results.flatMap(r => r.findings);
        console.log();
        for (const finding of allFindings.slice(0, 5)) {
          const color = finding.severity === 'critical' || finding.severity === 'high' 
            ? chalk.red 
            : finding.severity === 'medium' ? chalk.yellow : chalk.blue;
          console.log(color(`  [${finding.severity.toUpperCase()}] ${finding.ruleName}`));
          console.log(chalk.gray(`  ${finding.file}:${finding.line} - ${finding.message}`));
          console.log();
        }
        
        if (allFindings.length > 5) {
          console.log(chalk.gray(`... and ${allFindings.length - 5} more issues`));
        }
        
        console.log(chalk.cyan(`Run 'dirgha scan ${path}' for full details`));
        
      } catch (error) {
        console.error(chalk.red(`❌ Scan failed: ${(error as Error).message}`));
      }
    },
  },
  {
    name: '/secrets',
    description: 'Scan for hardcoded secrets and credentials',
    category: 'security',
    handler: async (args: string, ctx: ReplContext) => {
      const path = args.trim() || '.';
      
      console.log(chalk.cyan('🔑 Scanning for secrets...'));
      
      try {
        const stat = await import('node:fs').then(fs => fs.statSync(path));
        
        let results;
        if (stat.isDirectory()) {
          results = await scanDirectory(path, { 
            checkPromptInjection: false,
            checkDataExfiltration: false,
            checkCommandInjection: false,
            checkMaliciousCode: false,
            checkSupplyChain: false,
            checkSecrets: true,
          });
        } else {
          results = [await scanFile(path, { checkSecrets: true })];
        }
        
        const secretFindings = results.flatMap(r => 
          r.findings.filter(f => f.category === 'secrets')
        );
        
        if (secretFindings.length === 0) {
          console.log(chalk.green('✅ No hardcoded secrets found'));
          return;
        }
        
        console.log(chalk.red(`🚨 Found ${secretFindings.length} hardcoded secrets!`));
        console.log();
        
        for (const finding of secretFindings) {
          console.log(chalk.red(`  [${finding.severity.toUpperCase()}] ${finding.ruleName}`));
          console.log(chalk.gray(`  ${finding.file}:${finding.line}`));
          console.log(chalk.cyan(`  ⚠️  ${finding.remediation}`));
          console.log();
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Scan failed: ${(error as Error).message}`));
      }
    },
  },
];
