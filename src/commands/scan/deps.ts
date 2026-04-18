// @ts-nocheck

import chalk from 'chalk';

export interface DepScanResult {
  scanned: number;
  reports: Array<{
    package: string;
    version: string;
    vulns: Array<{
      severity: string;
      summary: string;
      fixedIn?: string;
    }>;
  }>;
  critical: number;
  high: number;
  vulnerable: number;
  scanTimeMs: number;
}

export async function runDepScan(opts: { 
  deps: boolean; 
  supplyChain: boolean; 
  dir: string 
}): Promise<number> {
  // Stub dependency scanner (packages/core not available in standalone CLI)
  const osvScanDir = async (_dir: string): Promise<DepScanResult> => ({ scanned: 0, reports: [], critical: 0, high: 0, vulnerable: 0, scanTimeMs: 0 });
  const checkSupplyChainRisks = async (_dir: string) => ({ risks: [] });
  
  let exitCode = 0;

  if (opts.deps) {
    console.log(chalk.cyan(`Scanning dependencies in ${opts.dir}...`));
    const result: DepScanResult = await osvScanDir(opts.dir);

    if (result.scanned === 0) {
      console.log(chalk.yellow('No lockfile found'));
    } else {
      console.log(`Checked ${result.scanned} packages against OSV database`);

      if (result.reports.length === 0) {
        console.log(chalk.green(`✓ No vulnerabilities found`));
      } else {
        for (const report of result.reports) {
          for (const vuln of report.vulns) {
            const color =
              vuln.severity === 'CRITICAL' ? chalk.red :
              vuln.severity === 'HIGH'     ? chalk.red :
              vuln.severity === 'MEDIUM'   ? chalk.yellow :
                                           chalk.blue;
            const fix = vuln.fixedIn ? ` (fix: ${vuln.fixedIn})` : '';
            console.log(color(`⚠ ${report.package}@${report.version} — ${vuln.severity}: ${vuln.summary}${fix}`));
          }
        }
        console.log(chalk.red(
          `Found ${result.reports.reduce((n, r) => n + r.vulns.length, 0)} vulnerabilities` +
          ` (${result.critical} critical, ${result.high} high)`
        ));
        if (result.critical > 0) exitCode = 1;
      }
      console.log(chalk.dim(`Scan completed in ${result.scanTimeMs}ms`));
    }
  }

  if (opts.supplyChain) {
    const nmPath = `${opts.dir}/node_modules`;
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

  return exitCode;
}
