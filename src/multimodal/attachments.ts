/**
 * multimodal/attachments.ts — File and image attachment handling
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Attachment, AttachmentType } from './types.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB for base64 overhead

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.csv': 'text/csv',
    '.js': 'text/javascript', '.ts': 'text/typescript',
    '.py': 'text/x-python', '.html': 'text/html',
    '.css': 'text/css',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function detectAttachmentType(mimeType: string): AttachmentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/') || 
      mimeType.includes('javascript') || 
      mimeType.includes('json') ||
      mimeType.includes('python')) return 'text';
  return 'file';
}

export function attachFile(filePath: string): { attachment: Attachment | null; error?: string } {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { attachment: null, error: `File not found: ${filePath}` };
    }

    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return { attachment: null, error: `Not a file: ${filePath}` };
    }

    const mimeType = detectMimeType(resolved);
    const type = detectAttachmentType(mimeType);
    const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

    if (stats.size > maxSize) {
      return { attachment: null, error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max ${maxSize / 1024 / 1024}MB)` };
    }

    const content = fs.readFileSync(resolved);
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      type,
      path: resolved,
      name: path.basename(resolved),
      size: stats.size,
      mimeType,
    };

    // For images, encode as base64 data URL
    if (type === 'image') {
      const base64 = content.toString('base64');
      attachment.content = `data:${mimeType};base64,${base64}`;
    }
    // For text files, include content preview
    else if (type === 'text' && stats.size < 100000) {
      attachment.content = content.toString('utf8');
      attachment.preview = attachment.content.slice(0, 500);
    }
    // For PDFs, just note size
    else if (type === 'pdf') {
      attachment.preview = `[PDF: ${(stats.size / 1024).toFixed(1)}KB]`;
    }

    return { attachment };
  } catch (e) {
    return { attachment: null, error: (e as Error).message };
  }
}

export function createImageContentBlock(base64DataUrl: string): { type: 'image_url'; image_url: { url: string; detail: 'auto' } } {
  return {
    type: 'image_url',
    image_url: {
      url: base64DataUrl,
      detail: 'auto',
    },
  };
}

export function formatAttachmentsForDisplay(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map(a => {
    const icon = a.type === 'image' ? '🖼️' : a.type === 'pdf' ? '📄' : '📎';
    return `  ${icon} ${a.name} (${(a.size / 1024).toFixed(1)}KB)`;
  });
  return '\n📎 Attachments:\n' + lines.join('\n');
}
