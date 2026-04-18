import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Recipe, RecipeParameter, RecipeSettings } from './types.js';

/**
 * Minimal YAML subset parser.
 * Supports: scalar key:value, multiline blocks (key: |), and
 * list-of-objects under `parameters:` and nested object under `settings:`.
 */
export function parseRecipe(yaml: string): Recipe {
  const lines = yaml.split('\n');
  const result: Partial<Recipe> & { parameters: RecipeParameter[]; settings: RecipeSettings } = {
    parameters: [],
    settings: {},
  };

  let i = 0;

  function readScalar(val: string): string {
    return val.trim().replace(/^['"]|['"]$/g, '');
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const stripped = line.trimEnd();
    if (!stripped || stripped.trimStart().startsWith('#')) { i++; continue; }

    // Top-level key: value
    const m = stripped.match(/^(\w[\w-]*):\s*(.*)/);
    if (!m) { i++; continue; }
    const [, key, rawVal] = m as [string, string, string];

    if (rawVal.trim() === '|') {
      // Multiline block — collect indented lines
      const base = stripped.length - stripped.trimStart().length;
      i++;
      const blockLines: string[] = [];
      while (i < lines.length) {
        const bl = lines[i]!;
        if (bl.trim() === '' || (bl.length > base && bl[base] === ' ')) {
          blockLines.push(bl.slice(base + 2)); // strip 2-space indent
          i++;
        } else break;
      }
      (result as any)[key] = blockLines.join('\n').trimEnd();
      continue;
    }

    if (rawVal === '') {
      // Block header — check if it's parameters or settings
      i++;
      if (key === 'parameters') {
        while (i < lines.length) {
          if (!lines[i]!.trim() || lines[i]!.match(/^  - /)) {
            if (!lines[i]!.trim()) { i++; continue; }
            const param: Partial<RecipeParameter> = {};
            i++; // skip `  - ` line (may have `name:` inline or on next)
            // Parse sub-keys until next `  - ` or top-level key
            while (i < lines.length && !lines[i]!.match(/^  - /) && !lines[i]!.match(/^\w/)) {
              const pm = lines[i]!.match(/^\s+([\w-]+):\s*(.*)/);
              if (pm) {
                const [, pk, pv] = pm as [string, string, string];
                if (pk === 'required') (param as any)[pk] = pv.trim() === 'true';
                else (param as any)[pk] = readScalar(pv);
              }
              i++;
            }
            if (param.name) result.parameters.push(param as RecipeParameter);
          } else break;
        }
      } else if (key === 'settings') {
        while (i < lines.length && lines[i]!.match(/^\s+\w/)) {
          const sm = lines[i]!.match(/^\s+([\w-]+):\s*(.*)/);
          if (sm) {
            const [, sk, sv] = sm as [string, string, string];
            if (sk === 'maxTurns') result.settings.maxTurns = parseInt(sv.trim(), 10);
            else if (sk === 'model') result.settings.model = readScalar(sv);
          }
          i++;
        }
      }
      continue;
    }

    (result as any)[key] = readScalar(rawVal);
    i++;
  }

  if (!result.title) throw new Error('Recipe missing required field: title');
  if (!result.instructions) throw new Error('Recipe missing required field: instructions');

  return {
    title: result.title as string,
    description: (result as any).description,
    instructions: result.instructions as string,
    parameters: result.parameters.length ? result.parameters : undefined,
    settings: Object.keys(result.settings).length ? result.settings : undefined,
  };
}

export function loadRecipeFromPath(filePath: string): Recipe | null {
  if (!existsSync(filePath)) return null;
  try {
    return parseRecipe(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`[recipe] Failed to parse ${filePath}: ${(e as Error).message}`);
    return null;
  }
}

export function loadRecipe(name: string): Recipe | null {
  const globalPath = join(homedir(), '.dirgha', 'recipes', `${name}.yaml`);
  const localPath = join(process.cwd(), `${name}.recipe.yaml`);
  return loadRecipeFromPath(globalPath) ?? loadRecipeFromPath(localPath);
}
