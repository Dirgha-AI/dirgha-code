/**
 * utils.ts — Utility functions for code edit visualization
 */

import { EditType } from './types.js';
import { C } from '../../colors.js';

export function getTypeColor(type: EditType): string {
  const colors: Record<EditType, string> = {
    create: '#50fa7b',
    modify: '#ffb86c',
    delete: '#ff5555',
    patch: '#8be9fd',
  };
  return colors[type] || C.textSecondary;
}

export function getTypeLabel(type: EditType): string {
  const labels: Record<EditType, string> = {
    create: 'NEW',
    modify: 'EDIT',
    delete: 'DEL',
    patch: 'PATCH',
  };
  return labels[type] || type.toUpperCase();
}

export function formatSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatLines(content: string): string {
  const lines = content.split('\n').length;
  return `${lines} line${lines !== 1 ? 's' : ''}`;
}
