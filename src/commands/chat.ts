// @ts-nocheck

import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Message } from '../types.js';
import { getUnifiedAgentClient } from '../services/UnifiedAgentClient.js';
import { isProjectInitialized, readProjectConfig } from '../utils/config.js';
import { generateContextSummary } from '../utils/context.js';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildChatSystemPrompt(): string {
  const base = 'You are Dirgha, an AI assistant. Be concise and helpful.';

  if (!isProjectInitialized()) return base;

  const config = readProjectConfig();
  if (!config?.context) return base;

  const summary = generateContextSummary(config.context);
  return `${base}\n\nProject context:\n${summary}`;
}

// ---------------------------------------------------------------------------
// Extract text from model response
// ---------------------------------------------------------------------------

function extractText(response: import('../types.js').ModelResponse): string {
  const texts = response.content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text as string);
  return texts.join('') || chalk.dim('(no response)');
}

// ---------------------------------------------------------------------------
// Print assistant reply with simple word-wrap awareness
// ---------------------------------------------------------------------------

function printReply(text: string): void {
  console.log();
  console.log(chalk.white(text));
  console.log();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function chatCommand(options: { model?: string; session?: string }): Promise<void> {
  const client = getUnifiedAgentClient();
  
  // Resume existing session if provided
  if (options.session) {
    client.setSessionId(options.session);
    console.log(chalk.dim(`Resuming session: ${options.session}`));
  }

  console.log(chalk.bold('Dirgha Chat'));
  console.log(chalk.dim('Provider: Unified Agent (40+ tools available)'));
  console.log(chalk.dim('Type "exit" or "quit" to leave.\n'));

  const messages: Message[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let input: string;

    try {
      const answer = await inquirer.prompt<{ input: string }>([
        {
          type: 'input',
          name: 'input',
          prefix: chalk.cyan('▸'),
          message: '',
        },
      ]);
      input = answer.input.trim();
    } catch {
      console.log(chalk.dim('\nBye.'));
      break;
    }

    if (!input) continue;

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.dim('Bye.'));
      break;
    }

    // Append user message
    messages.push({ role: 'user', content: input });

    // ✅ NEW: Use UnifiedAgentClient with full tool access!
    try {
      const response = await client.execute({
        messages,
        model: options.model,
        streaming: false,
        tools: 'all', // ✅ Full access to 40+ tools
      });

      // Append assistant message
      messages.push(response.message);
      
      // Print with tool usage info
      printReply(response.message.content);
      
      if (response.usage) {
        console.log(chalk.dim(
          `Tokens: ${response.usage.totalTokens} | Duration: ${response.timing.durationMs}ms`
        ));
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${msg}`));
      messages.pop(); // Remove failed user message
      continue;
    }
  }

  // Show session info on exit
  const sessionId = client.getSessionId();
  if (sessionId) {
    console.log(chalk.dim(`\nSession ID: ${sessionId}`));
    console.log(chalk.dim('Resume with: dirgha chat --session ' + sessionId));
  }
}
