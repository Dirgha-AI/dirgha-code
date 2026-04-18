// @ts-nocheck

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
// ManufacturingService: archived with packages/core — stub until re-implemented
const ManufacturingService = class { static async createPO(..._a: any[]) { throw new Error('Manufacturing service archived — re-enable packages/core'); } static async listPOs() { return []; } static async getPO() { return null; } };
import { readProjectConfig } from '../utils/config.js';

export function registerMakeCommands(program: Command): void {
  const make = program.command('make').description('Manufacturing and supply chain management');

  make
    .command('po <factoryId> <amount>')
    .description('Create a manufacturing Purchase Order with USDC escrow on Polygon')
    .option('--batch <n>', 'Batch size (number of units)', '100')
    .action(async (factoryId, amount, options) => {
      const config = readProjectConfig();
      if (!config) {
        console.log(chalk.red('Error: Project not initialized.'));
        return;
      }

      const spinner = ora(`Deploying PO Escrow to Polygon...`).start();
      
      try {
        const service = new ManufacturingService();
        const po = await service.createPO(
          config.project.id || 'unknown',
          factoryId,
          parseFloat(amount),
          parseInt(options.batch)
        );

        spinner.succeed(chalk.green('Manufacturing PO successfully deployed'));
        
        console.log();
        console.log(chalk.bold('PO Manifest (Polygon):'));
        console.log(`  PO ID       : ${chalk.cyan(po.poId)}`);
        console.log(`  Factory ID  : ${chalk.dim(po.factoryId)}`);
        console.log(`  Escrow Amt  : ${chalk.yellow(po.amountUsdc)} USDC`);
        console.log(`  Batch Size  : ${po.batchSize} units`);
        console.log(`  Status      : ${chalk.blue(po.status)}`);
        console.log();
        console.log(chalk.gray('Funds are locked in escrow and will be released upon delivery verification.'));
      } catch (err) {
        spinner.fail('PO Deployment failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      }
    });

  make
    .command('certify <poId>')
    .description('Certify a manufacturing batch and mint Product Passports on Base L2')
    .option('--hash <sha256>', 'BOM/CAD content hash', 'sha256:default')
    .action(async (poId, options) => {
      const spinner = ora(`Verifying delivery and minting Product Passports...`).start();
      
      try {
        const service = new ManufacturingService();
        // Simulate finding the PO
        const po = { poId, projectId: 'p1', factoryId: 'f1', amountUsdc: 1000, status: 'Completed' as any, batchSize: 100 };
        
        const passport = await service.certifyBatch(po, options.hash);

        spinner.succeed(chalk.green('Batch certified successfully'));
        
        console.log();
        console.log(chalk.bold('Sovereign Supply Chain:'));
        console.log(`  Passport ID : ${chalk.cyan(passport.passportId)}`);
        console.log(`  Factory SBT : ${chalk.dim(passport.factorySbtId)}`);
        console.log(`  Content HASH: ${chalk.dim(passport.contentHash)}`);
        console.log();
        console.log(chalk.yellow('Product provenance is now permanent on Base L2.'));
      } catch (err) {
        spinner.fail('Certification failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      }
    });
}
