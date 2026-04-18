/**
 * analytics/export.ts — Rich HTML session exports
 */
import { join } from 'path';

export interface ExportOptions {
  includeDiff?: boolean;
  includeMetrics?: boolean;
  includeTimeline?: boolean;
}

export function generateHTMLExport(
  sessionId: string,
  messages: Array<{ role: string; content: string; timestamp: string }>,
  options: ExportOptions = {}
): string {
  const parts: string[] = [];
  
  // Header
  parts.push(`<!DOCTYPE html>
<html>
<head>
  <title>Dirgha Session: ${sessionId}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; }
    .message { margin: 1rem 0; padding: 1rem; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f5f5f5; }
    .timestamp { font-size: 0.75rem; color: #666; }
    code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Session Export</h1>
  <p class="timestamp">Generated: ${new Date().toISOString()}</p>
`);

  // Messages
  for (const msg of messages) {
    const cssClass = msg.role === 'user' ? 'user' : 'assistant';
    parts.push(`
  <div class="message ${cssClass}">
    <div class="timestamp">${msg.timestamp}</div>
    <strong>${msg.role}:</strong>
    <div>${msg.content.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
  </div>
`);
  }

  // Footer
  if (options.includeMetrics) {
    parts.push(`
  <div style="margin-top: 2rem; padding: 1rem; background: #fff3e0; border-radius: 8px;">
    <h3>Session Metrics</h3>
    <p>Messages: ${messages.length}</p>
    <p>Tokens: ~${messages.reduce((sum, m) => sum + m.content.length / 4, 0).toFixed(0)}</p>
  </div>
`);
  }

  parts.push(`
</body>
</html>`);

  return parts.join('');
}

export async function writeExport(
  sessionId: string,
  html: string,
  outDir: string
): Promise<string> {
  const filename = join(outDir, `session-${sessionId}-${Date.now()}.html`);
  // In real implementation: await writeFile(filename, html);
  console.log(`[EXPORT] Writing to ${filename}`);
  return filename;
}
