/**
 * browser/accessibility.ts — A11y tree extraction
 */
import type { AccessibilityNode } from './types.js';

export function parseAccessibilityTree(html: string): AccessibilityNode {
  // Simplified - real implementation would use Playwright/CDP
  const root: AccessibilityNode = {
    role: 'document',
    name: 'Page',
    children: []
  };
  
  // Extract headings
  const headingMatches = html.matchAll(/<(h[1-6])([^>]*)>([^<]*)<\/\1>/gi);
  for (const match of headingMatches) {
    root.children.push({
      role: 'heading',
      name: match[3].trim(),
      value: match[1],
      children: []
    });
  }
  
  // Extract links
  const linkMatches = html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi);
  for (const match of linkMatches) {
    root.children.push({
      role: 'link',
      name: match[2].trim(),
      value: match[1],
      children: []
    });
  }
  
  // Extract buttons
  const buttonMatches = html.matchAll(/<button[^>]*>([^<]*)<\/button>/gi);
  for (const match of buttonMatches) {
    root.children.push({
      role: 'button',
      name: match[1].trim(),
      children: []
    });
  }
  
  return root;
}

export function formatAccessibilityTree(node: AccessibilityNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  let output = `${indent}[${node.role}] ${node.name || ''}${node.value ? ` = ${node.value}` : ''}\n`;
  
  for (const child of node.children) {
    output += formatAccessibilityTree(child, depth + 1);
  }
  
  return output;
}
