/**
 * multimodal/types.ts — Type definitions for multimodal features
 */

export type AttachmentType = 'image' | 'file' | 'pdf' | 'text';

export interface Attachment {
  id: string;
  type: AttachmentType;
  path: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  content?: string; // base64 for images, text for files
  preview?: string; // truncated preview
}

export interface ImageContentBlock {
  type: 'image_url';
  image_url: {
    url: string; // base64 data URL or http URL
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export type ContentPart = TextContentBlock | ImageContentBlock;

export interface MultimodalMessage {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
}
