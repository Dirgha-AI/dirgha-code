// @ts-nocheck
/**
 * CodeEditBox.tsx — Transparent code editing visualization (Gemini-style)
 * 
 * Shows code edits in round-corner boxes with:
 * - File path header with pill-shaped badge
 * - Line numbers for context
 * - Syntax-highlighted diff view
 * - Collapsible/expandable sections
 * - Animated transitions
 * 
 * Thoughts/outside text appear OUTSIDE the round boxes
 * Commands/edits appear INSIDE round boxes
 */
import React, { useState, useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { uid } from '../helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Syntax highlighting (lightweight regex-based)
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_PATTERNS: Record<string, Array<{ pattern: RegExp; color: string }>> = {
  typescript: [
    { pattern: /\b(import|export|from|const|let|var|function|class|interface|type|return|if|else|for|while|async|await|try|catch|throw|new|this)\b/g, color: C.accent },
    { pattern: /\b(string|number|boolean|any|void|never|unknown|null|undefined|true|false)\b/g, color: '#ff79c6' },
    { pattern: /\/\/.*$/gm, color: C.textFaint },
    { pattern: /\/\*[\s\S]*?\*\//g, color: C.textFaint },
    { pattern: /`[^`]*`/g, color: '#f1fa8c' },
    { pattern: /'[^']*'|"[^"]*"/g, color: '#f1fa8c' },
    { pattern: /\b\d+\b/g, color: '#bd93f9' },
  ],
  javascript: [
    { pattern: /\b(import|export|from|const|let|var|function|class|return|if|else|for|while|async|await|try|catch|throw|new|this)\b/g, color: C.accent },
    { pattern: /\b(null|undefined|true|false)\b/g, color: '#ff79c6' },
    { pattern: /\/\/.*$/gm, color: C.textFaint },
    { pattern: /`[^`]*`|'[^']*'|"[^"]*"/g, color: '#f1fa8c' },
  ],
  python: [
    { pattern: /\b(def|class|import|from|as|return|if|elif|else|for|while|try|except|raise|with|async|await|lambda|None|True|False)\b/g, color: C.accent },
    { pattern: /#.*/g, color: C.textFaint },
    { pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, color: C.textFaint },
    { pattern: /f'[^']*'|f"[^"]*"/g, color: '#f1fa8c' },
  ],
  markdown: [
    { pattern: /^#+\s+/gm, color: C.accent },
    { pattern: /\*\*[^*]+\*\*/g, color: '#ff79c6' },
    { pattern: /`[^`]+`/g, color: '#f1fa8c' },
    { pattern: /^[\s]*[-*+]\s/gm, color: C.accent },
  ],
  json: [
    { pattern: /"[^"]+":/g, color: '#ff79c6' },
    { pattern: /true|false|null/g, color: '#bd93f9' },
    { pattern: /\b\d+\b/g, color: '#bd93f9' },
  ],
  yaml: [
    { pattern: /^[\w-]+:/gm, color: '#ff79c6' },
    { pattern: /true|false|null/g, color: '#bd93f9' },
    { pattern: /#.*/g, color: C.textFaint },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', pyw: 'python', md: 'markdown', mdx: 'markdown',
    json: 'json', yaml: 'yaml', yml: 'yaml', css: 'css', scss: 'css',
    html: 'html', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', swift: 'swift',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  };
  return map[ext] || 'text';
}

function getTypeColor(type: EditType): string {
  switch (type) {
    case 'create': return '#50fa7b';  // green
    case 'modify': return '#ffb86c';  // orange
    case 'delete': return '#ff5555';  // red
    case 'patch': return '#8be9fd';   // cyan
    default: return C.textSecondary;
  }
}

function getTypeLabel(type: EditType): string {
  switch (type) {
    case 'create': return 'NEW';
    case 'modify': return 'EDIT';
    case 'delete': return 'DEL';
    case 'patch': return 'PATCH';
    default: return 'EDIT';
  }
}

function highlightCode(line: string, language: string): React.ReactNode {
  const patterns = LANGUAGE_PATTERNS[language] || [];
  if (!patterns.length) return <Text>{line}</Text>;

  const parts: Array<{ text: string; color?: string }> = [{ text: line }];

  for (const { pattern, color } of patterns) {
    const newParts: Array<{ text: string; color?: string }> = [];
    for (const part of parts) {
      if (part.color) {
        newParts.push(part);
        continue;
      }
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      while ((match = regex.exec(part.text)) !== null) {
        if (match.index > lastIndex) {
          newParts.push({ text: part.text.slice(lastIndex, match.index) });
        }
        newParts.push({ text: match[0], color });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.text.length) {
        newParts.push({ text: part.text.slice(lastIndex) });
      }
    }
    parts.length = 0;
    parts.push(...newParts);
  }

  return (
    <>
      {parts.map((p, i) => (
        p.color ? <Text key={i} color={p.color}>{p.text}</Text> : <Text key={i}>{p.text}</Text>
      ))}
    </>
  );
}

function formatLineNumber(num: number, maxDigits: number): string {
  return num.toString().padStart(maxDigits, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Edit Display Component
// ─────────────────────────────────────────────────────────────────────────────

interface SingleEditProps {
  edit: CodeEdit;
  isExpanded: boolean;
  onToggle: () => void;
  showLineNumbers: boolean;
  index: number;
}

function SingleEdit({ edit, isExpanded, onToggle, showLineNumbers, index }: SingleEditProps): JSX.Element {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const lang = edit.language || detectLanguage(edit.path);
  const typeColor = getTypeColor(edit.type);
  const lines = edit.newContent.split('\n');
  const maxDigits = Math.max(2, lines.length.toString().length);
  const displayLines = isExpanded ? lines : lines.slice(0, 8);
  const hasMore = lines.length > 8 && !isExpanded;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Round box header with pill badge */}
      <Box 
        borderStyle="round" 
        borderColor={typeColor}
        paddingX={1}
        width={Math.min(cols - 4, 120)}
      >
        <Box flexDirection="column" width="100%">
          {/* Header row: Index + Type badge + Path */}
          <Box gap={1} alignItems="center">
            <Text color={C.textFaint}>{index + 1}.</Text>
            {/* Pill-shaped type badge */}
            <Box 
              paddingX={1} 
              backgroundColor={typeColor}
            >
              <Text bold color="#282a36">{getTypeLabel(edit.type)}</Text>
            </Box>
            <Text bold color={C.textPrimary}>{edit.path}</Text>
            <Text color={C.textFaint}>({lines.length} lines)</Text>
          </Box>
          
          {/* Description if present */}
          {edit.description && (
            <Text color={C.textSecondary} dimColor>{edit.description}</Text>
          )}

          {/* Collapse/Expand hint */}
          <Text color={C.textFaint} dimColor>
            {isExpanded ? '▼ Press Enter to collapse' : '▶ Press Enter to expand'}
          </Text>
        </Box>
      </Box>

      {/* Code content in nested round box */}
      {isExpanded && (
        <Box 
          marginLeft={2}
          borderStyle="round" 
          borderColor={C.textFaint}
          paddingX={1}
          width={Math.min(cols - 6, 118)}
        >
          <Box flexDirection="column">
            {displayLines.map((line, i) => (
              <Box key={`${edit.id}-line-${i}`}>
                {showLineNumbers && (
                  <Box marginRight={1}>
                    <Text color={C.textFaint} dimColor>
                      {formatLineNumber((edit.lineStart || 1) + i, maxDigits)} │
                    </Text>
                  </Box>
                )}
                <Box flexGrow={1}>
                  {highlightCode(line, lang)}
                </Box>
              </Box>
            ))}
            {hasMore && (
              <Text color={C.textFaint} dimColor italic>
                ... {lines.length - 8} more lines (expand to view)
              </Text>
            )}
          </Box>
        </Box>
      )}

      {!isExpanded && lines.length > 0 && (
        <Box marginLeft={4}>
          <Text color={C.textFaint} dimColor>
            {lines[0].slice(0, 60)}{lines[0].length > 60 ? '...' : ''}
            {lines.length > 1 && ` (+${lines.length - 1} more)`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function CodeEditBox({ 
  edits, 
  maxHeight = 20,
  showLineNumbers = true,
  expandedByDefault = false 
}: CodeEditBoxProps): JSX.Element | null {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (expandedByDefault) return new Set(edits.map(e => e.id));
    return new Set();
  });
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Limit displayed edits to prevent overflow
  const visibleEdits = useMemo(() => {
    return edits.slice(0, maxHeight);
  }, [edits, maxHeight]);

  const totalHidden = edits.length - visibleEdits.length;

  if (!edits.length) return null;

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Section header - OUTSIDE the round box (thoughts/narrative) */}
      <Box marginBottom={1}>
        <Text color={C.accent} bold>📝 Code Changes</Text>
        <Text color={C.textSecondary}> — {edits.length} file{edits.length !== 1 ? 's' : ''} modified</Text>
      </Box>

      {/* Each edit in its own round box (commands/edits) */}
      <Box flexDirection="column">
        {visibleEdits.map((edit, index) => (
          <SingleEdit
            key={edit.id}
            edit={edit}
            isExpanded={expandedIds.has(edit.id)}
            onToggle={() => toggleExpand(edit.id)}
            showLineNumbers={showLineNumbers}
            index={index}
          />
        ))}
      </Box>

      {totalHidden > 0 && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={C.textFaint} dimColor italic>
            ... and {totalHidden} more edits (scroll to view)
          </Text>
        </Box>
      )}

      {/* Summary footer - OUTSIDE the round box */}
      <Box marginTop={1} gap={2}>
        <Text color={C.textFaint} dimColor>
          Created: {edits.filter(e => e.type === 'create').length}
        </Text>
        <Text color={C.textFaint} dimColor>
          Modified: {edits.filter(e => e.type === 'modify').length}
        </Text>
        <Text color={C.textFaint} dimColor>
          Deleted: {edits.filter(e => e.type === 'delete').length}
        </Text>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function for creating edits
// ─────────────────────────────────────────────────────────────────────────────

export function createCodeEdit(
  type: EditType,
  path: string,
  newContent: string,
  options?: {
    oldContent?: string;
    lineStart?: number;
    lineEnd?: number;
    description?: string;
    language?: string;
  }
): CodeEdit {
  return {
    id: uid(),
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

export default CodeEditBox;
