/**
 * agent/structured-output.ts — Validated structured output from LLM.
 *
 * Pattern from open-multi-agent: sub-agents return malformed JSON.
 * This wrapper validates + retries with error feedback (max 2 attempts).
 *
 * Usage:
 *   const tasks = await runWithStructuredOutput(prompt, parseTaskList, model, onText);
 */
import { runAgentLoop } from './loop.js';

type Parser<T> = (raw: string) => T;

/**
 * Extract JSON from an LLM response that may have prose around it.
 */
export function extractJSON(text: string): string {
  // Try to find a JSON block (code fence or bare object/array)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  // Find first { or [ and last } or ]
  const firstBrace = Math.min(
    text.indexOf('{') === -1 ? Infinity : text.indexOf('{'),
    text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
  );
  if (firstBrace === Infinity) return text;

  const openChar = text[firstBrace];
  const closeChar = openChar === '{' ? '}' : ']';
  const lastClose = text.lastIndexOf(closeChar);
  if (lastClose === -1) return text;

  return text.slice(firstBrace, lastClose + 1);
}

/**
 * Run a prompt and validate the result against a parser function.
 * On parse failure, retries once with the error message appended.
 */
export async function runWithStructuredOutput<T>(
  prompt: string,
  parser: Parser<T>,
  model: string,
  onText?: (t: string) => void,
  maxRetries = 1,
): Promise<T> {
  let lastError: unknown;
  let lastRaw = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const effectivePrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nYour previous response failed validation:\n${String(lastError)}\n\nPlease respond with ONLY valid JSON, no prose.`;

    let accumulated = '';
    try {
      await runAgentLoop(
        effectivePrompt,
        [],
        model,
        (t) => { accumulated += t; onText?.(t); },
        () => {},
      );

      const jsonStr = extractJSON(accumulated);
      const parsed = parser(jsonStr);
      return parsed;
    } catch (err) {
      lastError = err;
      lastRaw = accumulated;
    }
  }

  throw new Error(`Structured output failed after ${maxRetries + 1} attempts. Last response: ${lastRaw.slice(0, 200)}`);
}

/**
 * Standard JSON parse with helpful error message.
 */
export function parseJSON<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`JSON parse failed: ${(err as Error).message}. Input: ${text.slice(0, 100)}`);
  }
}
