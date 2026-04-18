/**
 * dirgha contribute — Fund the Dirgha Protocol.
 *
 * Registered as `contribute` (primary) with `support` kept as an alias so
 * existing docs and muscle memory don't break. Fetches a fresh BTC address
 * per invocation from the gateway's xPub derivation endpoint; prints
 * Lightning, fiat, and protocol-split context alongside.
 */
import { Command } from 'commander';
import chalk from 'chalk';

const GATEWAY = process.env.DIRGHA_GATEWAY_URL || 'https://api.dirgha.ai';
const WEB_CONTRIBUTE_URL = 'https://dirgha.ai/contribute';

async function fetchBtcAddress(): Promise<string | null> {
  try {
    const response = await fetch(`${GATEWAY}/api/funding/btc`);
    if (!response.ok) return null;
    const data = await response.json() as { address: string };
    return data.address ?? null;
  } catch {
    return null;
  }
}

async function runContribute(): Promise<void> {
  const address = await fetchBtcAddress();

  console.log();
  console.log(chalk.bold('Contribute to Dirgha'));
  console.log('Every satoshi and every rupee funds open-source compute infrastructure.');
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  console.log(chalk.bold('Bitcoin'));
  if (address) {
    console.log(`  ${chalk.cyan(address)}`);
    console.log(chalk.dim('  Fresh address per request · on-chain · privacy-first'));
  } else {
    console.log(chalk.dim('  (BTC endpoint unreachable — try again in a moment)'));
  }
  console.log();

  console.log(chalk.bold('Lightning'));
  console.log(`  ${chalk.blue(WEB_CONTRIBUTE_URL + '#lightning')}`);
  console.log(chalk.dim('  BOLT12 offer + QR code · any modern Lightning wallet'));
  console.log();

  console.log(chalk.bold('Card & UPI'));
  console.log(`  ${chalk.blue(WEB_CONTRIBUTE_URL)}`);
  console.log(chalk.dim('  Razorpay (India, UPI/cards) · Stripe (global cards) · GitHub Sponsors'));
  console.log();

  console.log(chalk.dim('Protocol fee allocation:'));
  console.log(chalk.dim('  · 70% → Guild workers — direct payment for compute and labor'));
  console.log(chalk.dim('  · 20% → CodeRails — paid to upstream open-source maintainers'));
  console.log(chalk.dim('  ·  5% → Sovereign Fund — protocol treasury'));
  console.log(chalk.dim('  ·  5% → Operations — infra, security audits, ecosystem grants'));
  console.log();
}

export default function supportCommand(program: Command): void {
  program
    .command('contribute')
    .alias('support')
    .description('Contribute to the Dirgha Protocol (Bitcoin, Lightning, card, UPI)')
    .action(runContribute);
}
