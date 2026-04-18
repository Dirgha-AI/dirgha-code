/**
 * agent/index.ts — Agent mode entry point.
 * Headless CLI execution for programmatic use.
 */
import { parseAgentArgs, loadInputFile } from './parser.js';
import { executeAgentMode, formatAgentOutput } from './executor.js';
import { chatHeadless } from './commands/chat.js';
import type { AgentOutput } from './types.js';

/** Main agent mode handler. */
export async function runAgentMode(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: dirgha agent <command> [flags]

Commands:
  chat --message "..."    Headless chat via gateway
                          Flags: --model <id>  --no-stream  --json

Global flags:
  --input <file.json>     Load structured input from JSON file
  --json                  Emit JSON output instead of plain text
  --help, -h              Show this help

Examples:
  dirgha agent chat --message "explain Redis cooldowns"
  dirgha agent chat --message "hi" --model accounts/fireworks/routers/kimi-k2p5-turbo --json
`);
    return 0;
  }

  // Check for --input file.json
  const inputFileIdx = args.indexOf('--input');
  let input: ReturnType<typeof parseAgentArgs>;

  if (inputFileIdx >= 0 && args[inputFileIdx + 1]) {
    input = loadInputFile(args[inputFileIdx + 1]);
  } else {
    input = parseAgentArgs(args);
  }

  // Check output format
  const format = args.includes('--json') ? 'json' : 'text';

  // Command registry
  const handlers = {
    chat: chatHeadless,
  };

  const result = await executeAgentMode(input, handlers);

  // Output result
  console.log(formatAgentOutput(result, format));

  return result.exitCode;
}

/** Generate SKILL.md for the CLI. */
export function generateSkill(): string {
  const { buildDirghaSkill } = require('../skills/generator.js');
  const skill = buildDirghaSkill();
  const { generateSkillMarkdown } = require('../skills/generator.js');
  return generateSkillMarkdown(skill);
}

export * from './types.js';
export * from './parser.js';
export * from './executor.js';
