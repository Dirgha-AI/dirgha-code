/**
 * providers/tools-format.ts — Tool format conversion utilities
 */
import { TOOL_DEFINITIONS } from '../agent/tools.js';

export function toOpenAITools() {
  return TOOL_DEFINITIONS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}
