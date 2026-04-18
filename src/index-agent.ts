/**
 * index-agent.ts — Agent mode entry point for Dirgha CLI.
 * Usage: dirgha agent --json chat "How do I fix this?"
 *        dirgha agent --input task.json
 */
import { runAgentMode } from './agent/index.js';

const args = process.argv.slice(2);

runAgentMode(args).then(code => {
  process.exit(code);
}).catch(err => {
  console.error(JSON.stringify({
    error: err instanceof Error ? err.message : 'Unknown error',
    exitCode: 1
  }));
  process.exit(1);
});
