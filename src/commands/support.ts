/**
 * dirgha support — Fund the Dirgha Protocol
 */
import { Command } from 'commander';
import chalk from 'chalk';

const GATEWAY = process.env.DIRGHA_GATEWAY_URL || 'https://api.dirgha.ai';

async function fetchBtcAddress(): Promise<string | null> {
  try {
    const response = await fetch(`${GATEWAY}/api/funding/btc`);
    if (!response.ok) return null;
    const data = await response.json() as { address: string };
    return data.address;
  } catch {
    return null;
  }
}

export default function supportCommand(program: Command): void {
  program
    .command('support')
    .description('Fund the Dirgha Protocol')
    .action(async () => {
      const address = await fetchBtcAddress() || 'bc1q_configure_DIRGHA_BTC_ADDRESSES';

      console.log();
      console.log(chalk.bold('Support the Dirgha Protocol'));
      console.log('Every satoshi funds open-source compute infrastructure.');
      console.log(chalk.dim('─'.repeat(60)));
      console.log();

      console.log(chalk.bold('Bitcoin'));
      console.log(`  ${chalk.cyan(address)}`);
      console.log(chalk.dim('  Single-use · Privacy-first'));
      console.log();

      console.log(chalk.dim('Protocol fee allocation:'));
      console.log(chalk.dim('  · 70% → Guild workers — direct payment for compute and labor'));
      console.log(chalk.dim('  · 20% → CodeRails — paid to upstream open-source maintainers'));
      console.log(chalk.dim('  ·  5% → Sovereign Fund — protocol treasury'));
      console.log(chalk.dim('  ·  5% → Operations — infra, security audits, ecosystem grants'));
      console.log();

      console.log(chalk.bold('Links'));
      console.log(`  GitHub Sponsors  →  ${chalk.blue('https://github.com/sponsors/dirghaai')}`);
      console.log(`  Open Collective  →  ${chalk.blue('https://opencollective.com/dirgha')}`);
      console.log(`  ${chalk.blue('https://dirgha.ai/support')}`);
      console.log();
    });
}
