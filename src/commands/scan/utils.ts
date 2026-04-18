
import chalk from 'chalk';
import { ScanResult } from '../../security/types.js';
import { SECURITY_RULES } from '../../security/rules.js';
import { generateReport } from '../../security/scanner.js';

export async function outputJson(results: ScanResult[], outputFile?: string): Promise<void> {
  const json = JSON.stringify(results, null, 2);
  if (outputFile) {
    await import('node:fs').then(fs => fs.writeFileSync(outputFile, json));
    console.log(`JSON report written to ${outputFile}`);
  } else {
    console.log(json);
  }
}

export async function outputMarkdown(results: ScanResult[], outputFile?: string): Promise<void> {
  const { generateReport } = await import('../../security/index.js');
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
      if (finding.code) md += `- **Code:** \`\`\`${finding.code}\`\`\`\n`;
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

export function sarifLevel(severity: string): string {
  const map: Record<string, string> = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
    info: 'none',
  };
  return map[severity] || 'warning';
}

export async function outputSarif(results: ScanResult[], outputFile?: string): Promise<void> {
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
              region: { startLine: f.line, startColumn: f.column },
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
  return SECURITY_RULES.map(r => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.description },
    fullDescription: { text: r.description },
    defaultConfiguration: { level: sarifLevel(r.severity) },
  }));
}
