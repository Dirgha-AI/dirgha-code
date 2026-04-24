/**
 * Tarball builder used by `dirgha deploy`. Produces a gzipped tar of
 * the cwd while honouring .gitignore + .dirghaignore and skipping
 * heavy-weight build artifacts. Caps total size at 500 MB.
 */

import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'dist_v2',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  '.pnpm-store',
];

const MAX_SIZE_BYTES = 500 * 1024 * 1024;

export interface TarballResult {
  path: string;
  sizeBytes: number;
}

export async function buildTarball(cwd: string, extraExcludes: string[] = []): Promise<TarballResult> {
  const dir = join(tmpdir(), 'dirgha-deploy');
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${randomUUID()}.tar.gz`);
  const excludes = [...DEFAULT_EXCLUDES, ...extraExcludes].flatMap(ex => ['--exclude', ex]);

  await new Promise<void>((resolveTar, rejectTar) => {
    const child = spawn('tar', ['-czf', out, ...excludes, '-C', cwd, '.'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const errChunks: Buffer[] = [];
    child.stderr.on('data', (b: Buffer) => errChunks.push(b));
    child.on('error', err => rejectTar(err));
    child.on('exit', code => {
      if (code === 0) resolveTar();
      else rejectTar(new Error(`tar exited ${code}: ${Buffer.concat(errChunks).toString('utf8')}`));
    });
  });

  const info = await stat(out);
  if (info.size > MAX_SIZE_BYTES) {
    throw new Error(`Tarball is ${info.size} bytes; exceeds ${MAX_SIZE_BYTES} byte cap. Add patterns to .dirghaignore.`);
  }
  return { path: out, sizeBytes: info.size };
}
