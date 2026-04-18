import { createInterface } from 'readline';

export interface PasteOptions {
  maxLines?: number;
  maxChars?: number;
  previewLength?: number;
  showProgress?: boolean;
}

export interface PasteResult {
  content: string;
  lineCount: number;
  charCount: number;
  byteCount: number;
  truncated: boolean;
  preview: string;
  duration: number;
}

export class PasteHandler {
  private defaultMaxLines = 1000;
  private defaultMaxChars = 50000;
  private previewLength = 200;

  async capturePaste(options: PasteOptions = {}): Promise<PasteResult> {
    const maxLines = options.maxLines ?? this.defaultMaxLines;
    const maxChars = options.maxChars ?? this.defaultMaxChars;
    const showProgress = options.showProgress ?? true;

    const startTime = Date.now();

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    return new Promise((resolve) => {
      let content = '';
      let lineCount = 0;
      let charCount = 0;
      let truncated = false;

      console.log('\n📋 Paste mode active. Press Ctrl+D when done (or Ctrl+C to cancel):\n');

      rl.on('line', (line) => {
        if (lineCount >= maxLines) {
          if (!truncated) {
            console.log(`\n⚠️  Reached ${maxLines} line limit. Truncating...`);
            truncated = true;
          }
          return;
        }

        if (charCount + line.length > maxChars) {
          if (!truncated) {
            console.log(`\n⚠️  Reached ${maxChars} char limit. Truncating...`);
            truncated = true;
          }
          const remaining = maxChars - charCount;
          content += line.slice(0, remaining) + '\n';
          charCount += remaining + 1;
          return;
        }

        content += line + '\n';
        lineCount++;
        charCount += line.length + 1;

        if (showProgress && lineCount % 50 === 0) {
          process.stdout.write(`\r📥 ${lineCount} lines, ${charCount.toLocaleString()} chars...`);
        }
      });

      rl.on('close', () => {
        if (showProgress) {
          process.stdout.write('\r' + ' '.repeat(60) + '\r');
        }

        const duration = Date.now() - startTime;
        const lines = content.split('\n').length - 1;
        const bytes = Buffer.byteLength(content, 'utf8');

        resolve({
          content: content.trim(),
          lineCount: lines,
          charCount: content.length,
          byteCount: bytes,
          truncated,
          preview: this.generatePreview(content, this.previewLength),
          duration,
        });
      });
    });
  }

  displayPasteSummary(result: PasteResult): void {
    const { lineCount, charCount, byteCount, truncated, preview, duration } = result;

    console.log('\n' + '─'.repeat(56));
    console.log('📊 PASTE SUMMARY');
    console.log('─'.repeat(56));
    console.log(`   Lines: ${lineCount.toLocaleString()}${truncated ? ' (truncated)' : ''}`);
    console.log(`   Chars: ${charCount.toLocaleString()}`);
    console.log(`   Bytes: ${this.formatBytes(byteCount)}`);
    console.log(`   Time:  ${(duration / 1000).toFixed(2)}s`);
    if (truncated) {
      console.log('   ⚠️  Content was truncated to prevent memory issues');
    }
    console.log('─'.repeat(56));

    if (preview) {
      console.log('\n👁️  PREVIEW (first 200 chars):');
      console.log('─'.repeat(56));
      console.log(preview);
      console.log('─'.repeat(56));
    }

    console.log('');
  }

  private generatePreview(content: string, length: number): string {
    const preview = content
      .slice(0, length)
      .replace(/\n/g, ' ↵ ')
      .replace(/\t/g, '→');
    return preview.length < content.length ? preview + '...' : preview;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async pasteFromClipboard(): Promise<PasteResult | null> {
    const { execSync } = await import('child_process');

    const tryClipboard = (cmd: string, args: string[]): string | null => {
      try {
        return execSync(`${cmd} ${args.join(' ')}`, { encoding: 'utf8', timeout: 2000 });
      } catch {
        return null;
      }
    };

    let content: string | null = null;

    if (process.platform === 'darwin') {
      content = tryClipboard('pbpaste', []);
    } else if (process.platform === 'linux') {
      content = tryClipboard('xclip', ['-selection', 'clipboard', '-o']);
      if (!content) {
        content = tryClipboard('xsel', ['--clipboard', '--output']);
      }
    } else if (process.platform === 'win32') {
      content = tryClipboard('powershell.exe', ['-command', 'Get-Clipboard']);
    }

    if (!content) return null;

    const lines = content.split('\n').length;
    const bytes = Buffer.byteLength(content, 'utf8');

    return {
      content: content.trim(),
      lineCount: lines,
      charCount: content.length,
      byteCount: bytes,
      truncated: false,
      preview: this.generatePreview(content, 200),
      duration: 0,
    };
  }
}

export const pasteHandler = new PasteHandler();
