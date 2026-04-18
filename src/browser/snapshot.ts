/**
 * browser/snapshot.ts — Page state capture
 */
import type { BrowserState } from './types.js';
import { parseAccessibilityTree, formatAccessibilityTree } from './accessibility.js';

export interface SnapshotResult {
  url: string;
  title: string;
  tree: string;
  elementCount: number;
}

export async function captureSnapshot(
  html: string,
  url: string
): Promise<SnapshotResult> {
  const tree = parseAccessibilityTree(html);
  
  function countElements(node: typeof tree): number {
    return 1 + node.children.reduce((sum, c) => sum + countElements(c), 0);
  }
  
  return {
    url,
    title: extractTitle(html),
    tree: formatAccessibilityTree(tree),
    elementCount: countElements(tree)
  };
}

function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'Untitled';
}
