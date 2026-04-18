/**
 * code-edit/index.ts — Barrel exports for code edit visualization
 */

// Main component
export { CodeEditBox } from './CodeEditBox.js';

// Sub-components
export { EditBadge } from './components/EditBadge.js';
export { EditItem } from './components/EditItem.js';
export { SyntaxHighlighter } from './components/SyntaxHighlighter.js';

// Types
export type {
  EditType,
  CodeEdit,
  CodeEditBoxProps,
  SyntaxPattern,
  EditItemProps,
} from './types.js';

// Utils
export { getTypeColor, getTypeLabel, formatSize, formatLines } from './utils.js';

// Language detection and patterns
export { detectLanguage, LANGUAGE_PATTERNS } from './patterns/index.js';

// Factory function
export function createCodeEdit(
  type: import('./types.js').EditType,
  path: string,
  newContent: string,
  options?: {
    oldContent?: string;
    lineStart?: number;
    lineEnd?: number;
    description?: string;
    language?: string;
  }
): import('./types.js').CodeEdit {
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    path,
    newContent,
    oldContent: options?.oldContent,
    lineStart: options?.lineStart,
    lineEnd: options?.lineEnd,
    description: options?.description,
    language: options?.language,
    timestamp: Date.now(),
  };
}
