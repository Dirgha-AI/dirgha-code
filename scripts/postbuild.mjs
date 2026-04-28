#!/usr/bin/env node
/**
 * Cross-platform postbuild: copy non-TS asset files into dist/.
 *
 * tsc only emits .d.ts/.js/.js.map for source .ts/.tsx; markdown,
 * SOUL files, scaffold templates, and skill docs need a separate
 * copy step. Bash `cp` doesn't work on Windows PowerShell, hence
 * this Node script — invoked from the `build` npm script.
 */
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function copyFile(src, dest) {
  cpSync(src, dest);
}

function copyAllMd(srcDir, destDir) {
  if (!existsSync(srcDir)) return 0;
  mkdirSync(destDir, { recursive: true });
  let n = 0;
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.md')) continue;
    cpSync(join(srcDir, name), join(destDir, name));
    n += 1;
  }
  return n;
}

// 1. soul prompt
copyFile('src/context/default-soul.md', 'dist/context/default-soul.md');

// 2. skill docs (slash command reads these from the installed package)
const skills = copyAllMd('src/skills', 'dist/skills');

console.log(`postbuild: 1 soul + ${skills} skill doc(s)`);
