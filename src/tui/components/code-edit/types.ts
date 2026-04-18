/**
 * types.ts — Type definitions for code edit visualization
 */

export type EditType = 'create' | 'modify' | 'delete' | 'patch';

export interface CodeEdit {
  id: string;
  type: EditType;
  path: string;
  language?: string;
  oldContent?: string;
  newContent: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
  timestamp: number;
}

export interface CodeEditBoxProps {
  edits: CodeEdit[];
  maxHeight?: number;
  showLineNumbers?: boolean;
  expandedByDefault?: boolean;
}

export interface SyntaxPattern {
  pattern: RegExp;
  color: string;
}

export interface EditItemProps {
  edit: CodeEdit;
  isExpanded: boolean;
  onToggle: () => void;
  showLineNumbers: boolean;
}
