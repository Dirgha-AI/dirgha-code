#!/usr/bin/env node
/**
 * Example Dirgha CLI Plugin
 * Demonstrates CLI-Hub plugin architecture
 */

const { Command } = require('commander');

const program = new Command();

program
  .name('dirgha-example')
  .description('Example plugin for Dirgha CLI')
  .version('1.0.0');

program
  .command('hello')
  .description('Say hello')
  .option('-n, --name <name>', 'Name to greet', 'World')
  .action((opts) => {
    console.log(`Hello, ${opts.name}!`);
    console.log('This command came from a Dirgha CLI plugin installed via CLI-Hub');
  });

program
  .command('status')
  .description('Check plugin status')
  .action(() => {
    console.log('Plugin: dirgha-example-plugin');
    console.log('Version: 1.0.0');
    console.log('Status: Running');
  });

if (require.main === module) {
  program.parse();
}

module.exports = { program };
