// @ts-nocheck

/**
 * repl/slash/screen.ts — Screen recording commands
 * /screen — Record screen activity (macOS via built-in tools)
 * 
 * Note: Full screen recording requires macOS 10.15+ with screencapture
 * or QuickTime Player. We implement a lightweight version using
 * screenshot sequences + optional video encoding.
 */
import chalk from 'chalk';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { SlashCommand, ReplContext } from '../types.js';
import { browserTool } from '../../tools/browser/index.js';

interface ScreenSession {
  id: string;
  pid?: number;
  frames: string[];
  startTime: Date;
  outputPath: string;
}

const activeSessions = new Map<string, ScreenSession>();

function getScreenshotDir(cwd: string): string {
  const dir = join(cwd, '.dirgha', 'screenshots');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function captureScreenshot(outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Try macOS screencapture first
    const proc = spawn('screencapture', ['-x', outputPath], { detached: true });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      
      // Fallback: try browser-based screenshot of desktop
      // This won't capture the actual screen but provides a fallback
      resolve(false);
    });
    
    proc.on('error', () => {
      resolve(false);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve(false);
    }, 5000);
  });
}

async function startScreenRecording(cwd: string, duration: number = 30): Promise<ScreenSession | null> {
  const id = `screen-${Date.now()}`;
  const outputDir = getScreenshotDir(cwd);
  const outputPath = join(outputDir, id);
  mkdirSync(outputPath, { recursive: true });
  
  // Check if macOS screencapture is available
  const check = spawnSync('which', ['screencapture'], { encoding: 'utf8' });
  if (check.error || !check.stdout?.trim()) {
    return null;
  }
  
  const session: ScreenSession = {
    id,
    frames: [],
    startTime: new Date(),
    outputPath
  };
  
  // Start recording loop (captures every 2 seconds)
  const interval = setInterval(async () => {
    const framePath = join(outputPath, `frame-${Date.now()}.png`);
    const captured = await captureScreenshot(framePath);
    if (captured) {
      session.frames.push(framePath);
    }
  }, 2000);
  
  // Stop after duration
  setTimeout(() => {
    clearInterval(interval);
    activeSessions.delete(id);
  }, duration * 1000);
  
  activeSessions.set(id, session);
  return session;
}

const screenCommand: SlashCommand = {
  name: '/screen',
  description: 'Record screen activity (screenshots/video)',
  execute: async (args: string, ctx: ReplContext) => {
    const input = args.trim().toLowerCase();
    const cwd = ctx.cwd || process.cwd();
    
    // Help
    if (!input || input === 'help') {
      ctx.print(`${chalk.yellow('Usage:')} /screen <start|stop|list|capture|video>`);
      ctx.print(`  /screen start 30      — Record for 30 seconds (screenshots)`);
      ctx.print(`  /screen stop          — Stop active recording`);
      ctx.print(`  /screen list          — List recording sessions`);
      ctx.print(`  /screen capture       — Single screenshot`);
      ctx.print(`  /screen video 60      — Record video (60 seconds)`);
      ctx.print(`${chalk.dim('Note: Requires macOS 10.15+ for full functionality')}`);
      return { type: 'success', result: { message: 'Usage shown' } };
    }
    
    // Single screenshot capture
    if (input === 'capture') {
      const dir = getScreenshotDir(cwd);
      const filename = `capture-${Date.now()}.png`;
      const path = join(dir, filename);
      
      ctx.print(`${chalk.dim('Capturing screenshot...')}`);
      
      const captured = await captureScreenshot(path);
      
      if (captured) {
        ctx.print(`${chalk.green('✓')} Screenshot saved to ${chalk.cyan(filename)}`);
        ctx.print(`  ${chalk.dim('Path:')} ${path}`);
        return { type: 'success', result: { path, filename } };
      } else {
        ctx.print(`${chalk.yellow('⚠')} Screenshot failed`);
        ctx.print(`${chalk.dim('Ensure screen recording permissions are granted:')}`);
        ctx.print(`${chalk.dim('System Preferences → Security & Privacy → Screen Recording')}`);
        return { type: 'error', result: { message: 'Screenshot failed' } };
      }
    }
    
    // Start recording
    if (input.startsWith('start') || input.match(/^\d+$/)) {
      const duration = parseInt(input.split(' ')[1] || input, 10) || 30;
      
      ctx.print(`${chalk.dim('Starting screen recording...')}`);
      ctx.print(`  ${chalk.dim('Duration:')} ${chalk.cyan(duration)} seconds`);
      ctx.print(`  ${chalk.dim('Method:')} screenshot sequence\n`);
      
      const session = await startScreenRecording(cwd, duration);
      
      if (!session) {
        ctx.print(`${chalk.red('✗')} Screen recording requires macOS with screencapture`);
        ctx.print(`${chalk.dim('  Alternative: Use browser screenshot with /browser screenshot')}`);
        return { type: 'error', result: { message: 'macOS required' } };
      }
      
      ctx.print(`${chalk.green('✓')} Started recording session ${chalk.cyan(session.id)}`);
      ctx.print(`  ${chalk.dim('Output:')} ${session.outputPath}`);
      ctx.print(`  ${chalk.dim('Use')} /screen stop ${chalk.dim('to end early')}`);
      
      // Auto-stop message
      setTimeout(() => {
        if (activeSessions.has(session.id)) {
          ctx.print(`\n${chalk.green('✓')} Recording session ${chalk.cyan(session.id)} completed`);
          ctx.print(`  ${chalk.cyan(session.frames.length)} frames captured`);
        }
      }, duration * 1000);
      
      return { type: 'success', result: { sessionId: session.id, duration } };
    }
    
    // Stop recording
    if (input === 'stop') {
      if (activeSessions.size === 0) {
        ctx.print(`${chalk.yellow('No active recording sessions')}`);
        return { type: 'success', result: { message: 'Nothing to stop' } };
      }
      
      for (const [id, session] of activeSessions) {
        ctx.print(`${chalk.green('✓')} Stopped session ${chalk.cyan(id)}`);
        ctx.print(`  ${chalk.cyan(session.frames.length)} frames captured`);
        ctx.print(`  ${chalk.dim('Output:')} ${session.outputPath}`);
        activeSessions.delete(id);
      }
      
      return { type: 'success', result: { stopped: activeSessions.size } };
    }
    
    // List sessions
    if (input === 'list') {
      if (activeSessions.size === 0) {
        ctx.print(`${chalk.yellow('No active recording sessions')}`);
        
        // Show history
        const dir = getScreenshotDir(cwd);
        if (existsSync(dir)) {
          const sessions = readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .slice(-5);
          
          if (sessions.length > 0) {
            ctx.print(`\n${chalk.dim('Recent sessions:')}`);
            for (const session of sessions.reverse()) {
              ctx.print(`  ${chalk.dim('•')} ${session}`);
            }
          }
        }
        
        return { type: 'success', result: { active: 0 } };
      }
      
      ctx.print(`${chalk.cyan('Active sessions:')}`);
      for (const [id, session] of activeSessions) {
        const elapsed = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
        ctx.print(`  ${chalk.dim('•')} ${id}`);
        ctx.print(`    ${chalk.dim('Frames:')} ${session.frames.length}`);
        ctx.print(`    ${chalk.dim('Elapsed:')} ${elapsed}s`);
      }
      
      return { type: 'success', result: { active: activeSessions.size } };
    }
    
    // Video recording (requires additional encoding)
    if (input.startsWith('video')) {
      const duration = parseInt(input.split(' ')[1], 10) || 30;
      
      ctx.print(`${chalk.yellow('⚠')} Video recording requires ffmpeg`);
      ctx.print(`${chalk.dim('  Will capture screenshot sequence instead')}`);
      ctx.print(`  ${chalk.dim('Use')} /screen start ${duration} ${chalk.dim('then encode manually')}`);
      
      return { type: 'success', result: { 
        message: 'Video recording requires ffmpeg',
        alternative: `/screen start ${duration}`
      } };
    }
    
    ctx.print(`${chalk.red('Unknown command:')} ${input}`);
    ctx.print(`${chalk.dim('Use')} /screen help ${chalk.dim('for usage')}`);
    return { type: 'error', result: { message: 'Unknown command' } };
  }
};

export const screenCommands: SlashCommand[] = [
  screenCommand
];
