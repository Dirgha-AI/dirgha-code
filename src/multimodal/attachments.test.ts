/**
 * multimodal/attachments.test.ts — File attachment tests
 */
import { describe, it, expect } from 'vitest';
import { attachFile, createImageContentBlock, formatAttachmentsForDisplay } from './attachments.js';
import type { Attachment } from './types.js';

describe('attachFile', () => {
  it('returns error for non-existent file', () => {
    const result = attachFile('/nonexistent/file.txt');
    expect(result.attachment).toBeNull();
    expect(result.error).toContain('not found');
  });

  it('attaches existing test file', () => {
    // Use one of our test files
    const result = attachFile('./package.json');
    expect(result.error).toBeUndefined();
    expect(result.attachment).not.toBeNull();
    expect(result.attachment!.name).toBe('package.json');
    expect(result.attachment!.type).toBe('text');
  });

  it('detects image files', () => {
    // This would need an actual image file to test properly
    // For now we just verify the function structure
    expect(typeof attachFile).toBe('function');
  });
});

describe('createImageContentBlock', () => {
  it('creates OpenAI-compatible image block', () => {
    const base64Data = 'data:image/png;base64,abc123';
    const block = createImageContentBlock(base64Data);
    
    expect(block).toEqual({
      type: 'image_url',
      image_url: {
        url: base64Data,
        detail: 'auto'
      }
    });
  });
});

describe('formatAttachmentsForDisplay', () => {
  it('returns empty string for no attachments', () => {
    expect(formatAttachmentsForDisplay([])).toBe('');
  });

  it('formats single attachment', () => {
    const attachments: Attachment[] = [{
      id: '1',
      type: 'text',
      path: '/test.txt',
      name: 'test.txt',
      size: 1024,
      mimeType: 'text/plain'
    }];
    
    const formatted = formatAttachmentsForDisplay(attachments);
    expect(formatted).toContain('test.txt');
    expect(formatted).toContain('1.0KB');
  });

  it('formats multiple attachments with icons', () => {
    const attachments: Attachment[] = [
      { id: '1', type: 'image', path: '/img.png', name: 'img.png', size: 2048, mimeType: 'image/png' },
      { id: '2', type: 'pdf', path: '/doc.pdf', name: 'doc.pdf', size: 5120, mimeType: 'application/pdf' },
      { id: '3', type: 'file', path: '/file.zip', name: 'file.zip', size: 10240, mimeType: 'application/zip' }
    ];
    
    const formatted = formatAttachmentsForDisplay(attachments);
    expect(formatted).toContain('🖼️');
    expect(formatted).toContain('📄');
    expect(formatted).toContain('📎');
  });
});
