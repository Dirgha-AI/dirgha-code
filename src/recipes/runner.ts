import { runAgentLoop } from '../agent/loop.js';
import type { Recipe } from './types.js';

export class RecipeValidationError extends Error {}

function substitutePlaceholders(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) return params[name]!;
    return `{{${name}}}`; // leave unresolved placeholders as-is
  });
}

export async function runRecipe(
  recipe: Recipe,
  params: Record<string, string>,
  model: string,
  onText: (t: string) => void,
  onTool: (name: string, input: Record<string, unknown>) => void,
): Promise<{ tokensUsed: number }> {
  // Validate required parameters
  if (recipe.parameters) {
    for (const param of recipe.parameters) {
      const value = params[param.name] ?? param.default;
      if (param.required && value === undefined) {
        throw new RecipeValidationError(
          `Recipe '${recipe.title}' requires parameter: ${param.name}${param.description ? ` (${param.description})` : ''}`,
        );
      }
      // Fill in defaults
      if (value !== undefined && !(param.name in params)) {
        params[param.name] = value;
      }
    }
  }

  // Substitute placeholders in instructions
  const effectiveInstructions = substitutePlaceholders(recipe.instructions, params);

  // Resolve model: recipe settings take priority
  const effectiveModel = recipe.settings?.model ?? model;

  const { tokensUsed } = await runAgentLoop(
    effectiveInstructions,
    [],
    effectiveModel,
    onText,
    onTool as (name: string, input: Record<string, any>) => void,
    undefined,
    undefined,
    { maxTurns: recipe.settings?.maxTurns },
  );

  return { tokensUsed };
}
