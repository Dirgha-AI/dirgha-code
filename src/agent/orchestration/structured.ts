// @ts-nocheck
/**
 * agent/orchestration/structured.ts — Structured output with Zod validation
 * 
 * Provides retry-capable structured output generation using Zod schemas.
 * Implements Open-Multi-Agent pattern for type-safe agent responses.
 * 
 * @module agent/orchestration/structured
 */

import { z, type ZodSchema, type ZodType } from 'zod';

/**
 * Options for structured output generation
 */
export interface StructuredOutputOptions<T> {
  schema: ZodSchema<T>;
  maxRetries?: number;
  timeoutMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
  strict?: boolean;
}

/**
 * Result of structured output generation
 */
export interface StructuredResult<T> {
  data: T;
  raw: string;
  attempts: number;
  durationMs: number;
  schema: string;
}

/**
 * Error for structured output failures
 */
export class StructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodError[],
    public readonly attempts: number,
    public readonly lastRaw: string
  ) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}

/**
 * Generate JSON schema from Zod schema
 * Useful for LLM prompts
 */
export function toJSONSchema(schema: ZodType): Record<string, unknown> {
  // Simplified JSON schema generation
  // In production, use zod-to-json-schema package
  const def = schema._def;
  
  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: toJSONSchema(def.type as ZodType)
      };
    case 'ZodObject':
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(shape).map(([key, val]) => [key, toJSONSchema(val as ZodType)])
        ),
        required: Object.keys(shape)
      };
    default:
      return { type: 'object' };
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        onRetry?.(lastError, attempt + 1);
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Generate structured output using schema validation
 * 
 * @example
 * ```typescript
 * const result = await generateStructured({
 *   schema: z.object({ name: z.string(), confidence: z.number() }),
 *   maxRetries: 3
 * }, async (prompt) => {
 *   // Call LLM with JSON schema instruction
 *   return await llm.generate(`Generate JSON for: ${prompt}`);
 * }, 'Extract user name');
 * ```
 */
export async function generateStructured<T>(
  options: StructuredOutputOptions<T>,
  generator: (prompt: string) => Promise<string>,
  prompt: string
): Promise<StructuredResult<T>> {
  const {
    schema,
    maxRetries = 3,
    onRetry,
    strict = true
  } = options;
  
  const startTime = Date.now();
  const jsonSchema = toJSONSchema(schema);
  const schemaInstruction = `Respond with valid JSON matching this schema: ${JSON.stringify(jsonSchema)}`;
  const fullPrompt = `${prompt}\n\n${schemaInstruction}`;
  
  let lastRaw = '';
  let validationErrors: z.ZodError[] = [];
  
  try {
    const result = await withRetry(async () => {
      lastRaw = await generator(fullPrompt);
      
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = lastRaw.match(/```(?:json)?\s*([\s\S]*?)```/) 
        || lastRaw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : lastRaw.trim();
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error(`Invalid JSON: ${jsonStr.slice(0, 100)}...`);
      }
      
      const validation = schema.safeParse(parsed);
      
      if (!validation.success) {
        validationErrors.push(validation.error);
        throw new Error(
          `Schema validation failed: ${validation.error.errors.map(e => e.message).join(', ')}`
        );
      }
      
      return {
        data: validation.data,
        raw: lastRaw,
        attempts: validationErrors.length + 1,
        durationMs: Date.now() - startTime,
        schema: JSON.stringify(jsonSchema)
      };
    }, maxRetries, onRetry);
    
    return result;
  } catch (error) {
    throw new StructuredOutputError(
      `Failed to generate valid output after ${maxRetries + 1} attempts`,
      validationErrors,
      validationErrors.length + 1,
      lastRaw
    );
  }
}

/**
 * Batch structured output generation
 * Efficient for processing multiple prompts
 */
export async function batchStructured<T>(
  options: StructuredOutputOptions<T>,
  generator: (prompt: string) => Promise<string>,
  prompts: string[],
  concurrency = 3
): Promise<(StructuredResult<T> | StructuredOutputError)[]> {
  const results: (StructuredResult<T> | StructuredOutputError)[] = [];
  
  // Process in batches
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(prompt => generateStructured(options, generator, prompt))
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push(result.reason as StructuredOutputError);
      }
    }
  }
  
  return results;
}
