
import chalk from 'chalk';
import { ScanResult } from '../../security/types.js';
import { generateReport } from '../../security/scanner.js';

export function outputTable(results: ScanResult[]): void {
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
