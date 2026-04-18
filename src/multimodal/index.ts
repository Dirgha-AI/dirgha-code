/**
 * multimodal/index.ts — Multi-modal feature exports
 */
export type { Attachment, AttachmentType, ContentPart, ImageContentBlock, MultimodalMessage } from './types.js';
export { attachFile, createImageContentBlock, formatAttachmentsForDisplay } from './attachments.js';
export { browseCommand, screenshotCommand, imageCommand, attachCommand, multimodalCommands } from './slash.js';
