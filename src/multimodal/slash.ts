/**
 * multimodal/slash.ts — Slash commands for multimodal features
 */
import type { SlashCommand, ReplContext } from '../repl/slash/types.js';
import chalk from 'chalk';
import { attachFile, formatAttachmentsForDisplay } from './attachments.js';
import type { Message } from '../types.js';

function getAccent() {
  return (s: string) => chalk.cyan(s); // Fallback accent color
}

export const browseCommand: SlashCommand = {
  name: 'browse',
  description: 'Navigate to URL and extract page content',
  category: 'dev',
  async handler(args, ctx: ReplContext) {
    const url = args.trim();
    if (!url) {
      return chalk.red('Usage: /browse <url>');
    }

    const { browserTool } = await import('../tools/browser.js');
    const result = await browserTool({ action: 'navigate', url });

    if (result.error) {
      return chalk.red(`❌ ${result.error}`);
    }

    let out = getAccent()(`✓ Fetched: ${url}`) + '\n';
    out += result.result.slice(0, 2000);
    if (result.result.length > 2000) {
      out += chalk.dim(`\n\n... (${result.result.length - 2000} more chars)`);
    }
    return out;
  },
};

export const screenshotCommand: SlashCommand = {
  name: 'screenshot',
  description: 'Capture screenshot of webpage (requires Playwright)',
  category: 'dev',
  async handler(args, ctx: ReplContext) {
    const url = args.trim();
    if (!url) {
      return chalk.red('Usage: /screenshot <url>');
    }

    const { browserTool } = await import('../tools/browser.js');
    const result = await browserTool({ action: 'screenshot', url });

    if (result.error) {
      let out = chalk.red(`❌ ${result.error}`) + '\n';
      out += chalk.dim('Install Playwright: npx playwright install chromium');
      return out;
    }

    let out = getAccent()('✓ Screenshot saved') + '\n';
    out += result.result;
    return out;
  },
};

export const imageCommand: SlashCommand = {
  name: 'image',
  description: 'Attach image to next message (vision models)',
  category: 'dev',
  async handler(args, ctx: ReplContext) {
    const filePath = args.trim();
    if (!filePath) {
      return chalk.red('Usage: /image <path>');
    }

    const { attachment, error } = attachFile(filePath);

    if (error || !attachment) {
      return chalk.red(`❌ ${error || 'Failed to attach image'}`);
    }

    if (attachment.type !== 'image') {
      let out = chalk.yellow(`⚠️ Not an image: ${attachment.name}`) + '\n';
      out += chalk.dim('Use /attach for general files');
      return out;
    }

    // Store attachment in context for next message
    if (!ctx.systemOverrides) ctx.systemOverrides = [];
    ctx.systemOverrides.push(`__ATTACHMENT__:${attachment.id}`);

    // Also store in session state
    const { saveSessionAttachment } = await import('../session/persistence.js');
    await saveSessionAttachment(ctx.sessionId, attachment);

    let out = getAccent()(`✓ Image attached: ${attachment.name}`) + '\n';
    out += chalk.dim(`  Size: ${(attachment.size / 1024).toFixed(1)}KB`) + '\n';
    out += chalk.dim('  Send a message to include this image');
    return out;
  },
};

export const attachCommand: SlashCommand = {
  name: 'attach',
  description: 'Attach file to conversation context',
  category: 'dev',
  async handler(args, ctx: ReplContext) {
    const filePath = args.trim();
    if (!filePath) {
      return chalk.red('Usage: /attach <path>');
    }

    const { attachment, error } = attachFile(filePath);

    if (error || !attachment) {
      return chalk.red(`❌ ${error || 'Failed to attach file'}`);
    }

    // Add file content as system context
    if (attachment.content && attachment.type === 'text') {
      const content = `[Attached file: ${attachment.name}]\n\`\`\`\n${attachment.content}\n\`\`\``;
      ctx.messages.push({ role: 'system', content } as Message);
    }

    let out = getAccent()(`✓ Attached: ${attachment.name}`);
    if (attachment.preview) {
      out += '\n' + chalk.dim(`  Preview: ${attachment.preview.slice(0, 100)}...`);
    }
    return out;
  },
};

export const multimodalCommands: SlashCommand[] = [
  browseCommand,
  screenshotCommand,
  imageCommand,
  attachCommand,
];
