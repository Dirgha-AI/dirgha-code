import chalk from 'chalk';
import ora from 'ora';
import {
  isProjectInitialized,
  readProjectConfig,
  writeProjectConfig,
  createDefaultConfig,
} from '../utils/config.js';
import { detectProjectType, scanProject } from '../utils/context.js';

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export async function initCommand(options: {
  force?: boolean;
  verbose?: boolean;
}): Promise<void> {
  const already = isProjectInitialized();

  if (already && !options.force) {
    const config = readProjectConfig();
    if (config) {
      console.log(chalk.yellow('Project already initialized.'));
      console.log();
      console.log(chalk.bold('Current config:'));
      console.log(`  Name      : ${config.project.name}`);
      console.log(`  Type      : ${config.project.type}`);
      console.log(`  Files     : ${config.context.structure.fileCount}`);
      console.log(`  Deps      : ${config.context.dependencies.totalCount}`);
      console.log(`  Provider  : ${config.preferences.defaultProvider}`);
      console.log(`  Model     : ${config.preferences.defaultModel}`);
      console.log();
      console.log(chalk.dim('Run with --force to re-initialize.'));
    }
    return;
  }

  const spinner = ora('Scanning project...').start();

  let projectType: string;
  let context;
  try {
    projectType = detectProjectType();
    context = await scanProject();
    spinner.succeed('Project scanned');
  } catch (err) {
    spinner.fail('Scan failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return;
  }

  const config = createDefaultConfig();
  config.project.type = projectType;
  config.project.detectedAt = new Date().toISOString();
  config.context = context;

  writeProjectConfig(config);

  console.log();
  console.log(chalk.green('✔ Initialized'));
  console.log();
  console.log(chalk.bold('Project summary:'));
  console.log(`  Type      : ${chalk.cyan(projectType)}`);
  console.log(`  Files     : ${chalk.cyan(context.structure.fileCount)}`);
  console.log(`  Deps      : ${chalk.cyan(context.dependencies.totalCount)} (${context.dependencies.manager})`);

  if (context.git) {
    const clean = context.git.isClean ? chalk.green('clean') : chalk.yellow('dirty');
    console.log(`  Branch    : ${chalk.cyan(context.git.branch)} (${clean})`);
  }

  if (options.verbose && context.importantFiles.length > 0) {
    console.log(`  Key files : ${context.importantFiles.join(', ')}`);
  }

  console.log();
  console.log(chalk.dim('Run dirgha to start coding'));
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

export async function statusCommand(): Promise<void> {
  if (!isProjectInitialized()) {
    console.log(chalk.yellow('No .dirgha/config.json found — run dirgha init first.'));
    return;
  }

  const config = readProjectConfig();
  if (!config) {
    console.log(chalk.red('Config file unreadable. Try: dirgha init --force'));
    return;
  }

  const { project, context, preferences } = config;

  console.log(chalk.bold('Project'));
  console.log(`  Name      : ${chalk.cyan(project.name)}`);
  console.log(`  Type      : ${chalk.cyan(project.type)}`);
  console.log(`  Root      : ${chalk.dim(project.root)}`);
  console.log(`  Init at   : ${chalk.dim(project.detectedAt)}`);
  console.log();

  console.log(chalk.bold('Context'));
  console.log(`  Files     : ${context.structure.fileCount}`);
  console.log(`  Dirs      : ${context.structure.directories.length}`);
  console.log(`  Deps      : ${context.dependencies.totalCount} (${context.dependencies.manager})`);
  console.log();

  if (context.git) {
    const clean = context.git.isClean ? chalk.green('clean') : chalk.yellow('dirty');
    console.log(chalk.bold('Git'));
    console.log(`  Branch    : ${chalk.cyan(context.git.branch)} (${clean})`);
    console.log(`  Remote    : ${chalk.dim(context.git.remote)}`);
    console.log(`  Last      : ${chalk.dim(context.git.lastCommit)}`);
    console.log();
  }

  console.log(chalk.bold('Preferences'));
  console.log(`  Provider  : ${chalk.cyan(preferences.defaultProvider)}`);
  console.log(`  Model     : ${chalk.cyan(preferences.defaultModel)}`);
  console.log(`  AutoApply : ${preferences.autoApply}`);
  console.log(`  Verbose   : ${preferences.verbose}`);
}
