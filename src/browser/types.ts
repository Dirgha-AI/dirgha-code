/**
 * browser/types.ts — Browser tool types
 */
export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  children: AccessibilityNode[];
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface BrowserState {
  url: string;
  title: string;
  accessibilityTree: AccessibilityNode;
  screenshot?: Buffer;
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'snapshot' | 'vision';
  selector?: string;
  value?: string;
  direction?: 'up' | 'down';
  url?: string;
}
