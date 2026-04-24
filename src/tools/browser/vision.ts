/**
 * browser/vision.ts — visual page analysis via a screenshot + vision-capable LLM.
 *
 * The DOM-only browser tools (snapshot, find by role) give the agent a
 * structured view of a page. Many tasks — "does this look right?",
 * "where's the submit button?", "what does the error state show?" —
 * are faster and more reliable from the rendered pixels than from
 * parsing accessibility trees. This action bridges that gap:
 *
 *   1. Takes a screenshot via agent-browser.
 *   2. Sends the image to a vision-capable model.
 *   3. Returns the model's textual description as the tool result.
 *
 * Provider detection matches `src/providers/detection.ts`:
 *   - Gateway (logged in) → /api/vision
 *   - Anthropic key      → claude-opus-4-7 messages API
 *   - OpenAI key         → gpt-5.4 responses API
 *   - Others             → error (ask user to log in or set a key)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolResult } from '../../types.js';

const MAX_PROMPT_LENGTH = 2000;

function captureScreenshot(): string {
  const outPath = join(tmpdir(), `dirgha_vision_${Date.now()}.png`);
  execSync(`agent-browser screenshot "${outPath}"`, { stdio: 'pipe', timeout: 30_000 });
  if (!existsSync(outPath)) throw new Error('Screenshot was not written');
  return outPath;
}

function toBase64(path: string): string {
  return readFileSync(path).toString('base64');
}

async function callAnthropicVision(prompt: string, imageB64: string): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageB64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic vision: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  const blocks = data?.content ?? [];
  return blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

async function callOpenAIVision(prompt: string, imageB64: string): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI vision: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callGatewayVision(prompt: string, imageB64: string): Promise<string> {
  const gateway = process.env['DIRGHA_API_URL'] ?? 'https://api.dirgha.ai';
  const token = process.env['DIRGHA_API_KEY'];
  const res = await fetch(`${gateway}/api/vision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt, image: imageB64, imageMediaType: 'image/png' }),
  });
  if (!res.ok) throw new Error(`Gateway vision: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  return data?.text ?? data?.content ?? '';
}

export async function visionAction(input: Record<string, any>): Promise<ToolResult> {
  let prompt = String(input['prompt'] ?? 'Describe what is visible on the current page, including any buttons, forms, and visible errors.');
  if (prompt.length > MAX_PROMPT_LENGTH) prompt = prompt.slice(0, MAX_PROMPT_LENGTH);

  let screenshotPath: string;
  try {
    screenshotPath = String(input['screenshot'] ?? captureScreenshot());
  } catch (e) {
    return { tool: 'browser', result: '', error: `Screenshot failed: ${(e as Error).message}. Is agent-browser installed and a page open?` };
  }

  if (!existsSync(screenshotPath)) {
    return { tool: 'browser', result: '', error: `Screenshot not found: ${screenshotPath}` };
  }

  let imageB64: string;
  try {
    imageB64 = toBase64(screenshotPath);
  } catch (e) {
    return { tool: 'browser', result: '', error: `Failed to read screenshot: ${(e as Error).message}` };
  }

  // Pick the visionprovider in the same order the agent loop picks its main provider:
  //   gateway (logged in) → anthropic (key) → openai (key)
  let text = '';
  try {
    if (process.env['DIRGHA_API_KEY']) {
      text = await callGatewayVision(prompt, imageB64);
    } else if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY']) {
      text = await callAnthropicVision(prompt, imageB64);
    } else if (process.env['OPENAI_API_KEY']) {
      text = await callOpenAIVision(prompt, imageB64);
    } else {
      return {
        tool: 'browser',
        result: '',
        error: 'No vision-capable provider configured. Run `dirgha login`, or set ANTHROPIC_API_KEY / OPENAI_API_KEY.',
      };
    }
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }

  return { tool: 'browser', result: `Screenshot: ${screenshotPath}\nVision analysis:\n${text}` };
}
