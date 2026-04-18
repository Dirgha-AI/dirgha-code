/**
 * Project Context Resolution
 * @module commands/curate/project
 */
import fs from 'fs';
import chalk from 'chalk';

export function resolveProjectId(projectFlag: boolean): string | undefined {
  if (!projectFlag) return undefined;

  const ctxPath = `${process.cwd()}/.dirgha/context.json`;
  try {
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
    return ctx.projectId;
  } catch {
    console.log(chalk.yellow('Warning: No project context found. Run `dirgha init` first.'));
    return undefined;
  }
}
