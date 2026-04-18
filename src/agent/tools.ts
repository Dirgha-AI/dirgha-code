/**
 * agent/tools.ts — Re-exports from tools/ slice.
 * All tool implementations live in src/tools/.
 * This file is kept for backward compatibility (loop.ts imports from here).
 */
export { TOOL_DEFINITIONS, executeTool, executeToolAsync } from '../tools/index.js';
