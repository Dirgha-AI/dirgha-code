/**
 * browser/launcher.ts — Launch and control Dirgha Browser (Electron)
 */
import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

let browserProcess: ChildProcess | null = null;

export interface LaunchOptions {
  headless?: boolean;
  dev?: boolean;
  url?: string;
}

export function findBrowserExecutable(): string | null {
  const platform = os.platform();
  const candidates = [
    process.env.DIRGHA_BROWSER_PATH,
    platform === 'darwin' ? '/Applications/Dirgha Browser.app/Contents/MacOS/Dirgha Browser' : null,
    platform === 'win32' ? path.join(os.homedir(), 'AppData/Local/DirghaBrowser/DirghaBrowser.exe') : null,
    platform === 'linux' ? '/usr/bin/dirgha-browser' : null,
    path.join(os.homedir(), '.local/bin/dirgha-browser'),
    path.join(process.cwd(), 'node_modules/.bin/dirgha-browser'),
  ].filter(Boolean) as string[];
  
  for (const bin of candidates) {
    try {
      if (bin.includes(' ') && !bin.endsWith('.exe')) {
        execSync(`test -x "${bin}"`, { stdio: 'ignore' });
      } else {
        execSync(`"${bin}" --version`, { stdio: 'ignore' });
      }
      return bin;
    } catch { continue; }
  }
  return null;
}

export function isBrowserRunning(): boolean {
  if (browserProcess && !browserProcess.killed) return true;
  try {
    execSync('pgrep -f "dirgha-browser|Dirgha Browser"', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<ChildProcess | null> {
  const executable = findBrowserExecutable();
  if (!executable) throw new Error('Dirgha Browser not found. Set DIRGHA_BROWSER_PATH');
  if (isBrowserRunning() && !options.dev) {
    console.log('Browser already running');
    return browserProcess;
  }
  const args: string[] = ['--ipc-port=9876'];
  if (options.headless) args.push('--headless');
  if (options.dev) args.push('--dev');
  if (options.url) args.push(`--app-url=${options.url}`);
  browserProcess = spawn(executable, args, { detached: false, stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 2000));
  return browserProcess;
}

export function killBrowser(): boolean {
  if (browserProcess) {
    browserProcess.kill('SIGTERM');
    browserProcess = null;
    return true;
  }
  try {
    execSync('pkill -f "dirgha-browser|Dirgha Browser"', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}
